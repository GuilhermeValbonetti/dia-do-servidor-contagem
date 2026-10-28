import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createApp } from '../src/app.js'

function createTestDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE servidores (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      matricula TEXT NOT NULL,
      origem TEXT NOT NULL,
      UNIQUE (origem, matricula)
    );
    CREATE TABLE credenciamentos (
      servidor_id INTEGER PRIMARY KEY REFERENCES servidores(id) ON DELETE RESTRICT,
      confirmado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE sorteios (
      id INTEGER PRIMARY KEY,
      numero INTEGER NOT NULL UNIQUE,
      servidor_id INTEGER NOT NULL UNIQUE REFERENCES servidores(id) ON DELETE RESTRICT
    );
    CREATE TRIGGER credenciamentos_vencedor_nao_pode_ser_desfeito
    BEFORE DELETE ON credenciamentos
    WHEN EXISTS (SELECT 1 FROM sorteios WHERE servidor_id = OLD.servidor_id)
    BEGIN
      SELECT RAISE(ABORT, 'Presença de servidor contemplado não pode ser desfeita');
    END;
  `)
  db.prepare(
    'INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)',
  ).run(1, 'Ana Silva', '00123', 'prefeitura')
  db.prepare(
    'INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)',
  ).run(2, 'Bruno Silva', '00123', 'camara')
  db.prepare(
    'INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)',
  ).run(3, 'Ana Silva', '00124', 'prefeitura')
  db.prepare(
    'INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)',
  ).run(4, 'Carla Souza', '00125', 'prefeitura')
  return db
}

async function startTestServer(db) {
  const server = createApp(db).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()

  return {
    server,
    request: (route, options) =>
      fetch(`http://127.0.0.1:${address.port}${route}`, options),
  }
}

async function closeTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

test('confirmed presence survives reopening a disposable database and API', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'credenciamento-persistencia-'),
  )
  const databasePath = path.join(directory, 'teste.sqlite')
  const fixture = createTestDatabase()
  try {
    await fixture.backup(databasePath)
  } finally {
    fixture.close()
  }
  try {
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const db = new Database(databasePath)
      const { server, request } = await startTestServer(db)
      try {
        if (iteration === 0) {
          const response = await request('/api/credenciamentos', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ servidorId: 1, matricula: '00123' }),
          })
          assert.equal(response.status, 201)
        }
        const confirmed = await (
          await request('/api/servidores?status=confirmed')
        ).json()
        assert.equal(confirmed.paginacao.total, 1)
        assert.equal(confirmed.dados[0].id, 1)
        const recent = await (
          await request('/api/credenciamentos/recentes')
        ).json()
        assert.equal(recent.dados[0].id, 1)
        assert.equal(
          recent.dados[0].confirmadoEm,
          confirmed.dados[0].confirmadoEm,
        )
      } finally {
        await closeTestServer(server)
        db.close()
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('global filters, text search and recent confirmations ignore the current directory page', async () => {
  const db = createTestDatabase()
  const insert = db.prepare(
    'INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)',
  )
  for (let id = 5; id <= 65; id += 1)
    insert.run(id, `Servidor ${id}`, String(id), 'prefeitura')
  insert.run(66, 'Zélia Última', '00066', 'prefeitura')
  db.prepare(
    'INSERT INTO credenciamentos (servidor_id, confirmado_em) VALUES (?, ?)',
  ).run(66, '2026-10-28T12:00:00Z')
  db.prepare(
    'INSERT INTO credenciamentos (servidor_id, confirmado_em) VALUES (?, ?)',
  ).run(2, '2026-10-28T11:00:00Z')
  db.prepare('INSERT INTO sorteios (numero, servidor_id) VALUES (1, 2)').run()
  const { server, request } = await startTestServer(db)
  const get = async (route) => (await request(route)).json()
  try {
    const first = await get('/api/servidores?limit=50')
    assert.ok(!first.dados.some(({ id }) => id === 66))
    const confirmed = await get(
      '/api/servidores?status=confirmed&limit=1&page=2',
    )
    assert.equal(confirmed.paginacao.total, 2)
    assert.equal(confirmed.paginacao.paginas, 2)
    assert.equal(confirmed.dados[0].id, 66)
    const pending = await get('/api/servidores?status=pending&limit=100')
    assert.equal(pending.paginacao.total, 64)
    assert.ok(pending.dados.every(({ credenciado }) => !credenciado))
    assert.equal((await get('/api/servidores?status=winner')).dados[0].id, 2)
    const search = await get('/api/servidores?busca=zelia&status=confirmed')
    assert.equal(search.paginacao.total, 1)
    assert.equal(search.dados[0].id, 66)
    assert.equal((await get('/api/servidores?busca=camara')).paginacao.total, 1)
    assert.equal(
      (await get('/api/servidores?busca=00066')).dados[0].matricula,
      '00066',
    )
    assert.equal((await get('/api/servidores?busca=%25')).paginacao.total, 0)
    assert.equal(
      (await get('/api/servidores?busca=%27%20OR%201%3D1')).paginacao.total,
      0,
    )
    assert.equal(
      (await get('/api/servidores?matricula=00123&status=pending')).paginacao
        .total,
      1,
    )
    const recent = await get('/api/credenciamentos/recentes?limit=1')
    assert.equal(recent.dados[0].id, 66)
    assert.equal(recent.dados[0].confirmadoEm, '2026-10-28T12:00:00Z')
    assert.equal(recent.dados[0].origem, 'prefeitura')
    for (const route of [
      '/api/servidores?status=invalid',
      '/api/servidores?busca=a&busca=b',
      '/api/credenciamentos/recentes?limit=101',
    ]) {
      assert.equal((await request(route)).status, 400)
    }
    assert.equal(
      (await request('/api/credenciamentos/66', { method: 'DELETE' })).status,
      200,
    )
    assert.equal(
      (await get('/api/servidores?status=confirmed')).paginacao.total,
      1,
    )
    assert.equal((await get('/api/credenciamentos/recentes')).dados[0].id, 2)
    assert.equal(
      (await get('/api/credenciamentos/indicadores')).presencasConfirmadas,
      1,
    )
  } finally {
    await closeTestServer(server)
    db.close()
  }
})

test('credenciamento API supports search, duplicate institutions, pagination, and indicators', async () => {
  const db = createTestDatabase()
  const { server, request } = await startTestServer(db)

  try {
    let response = await request('/api/servidores?matricula=00123')
    assert.equal(response.status, 200)
    let body = await response.json()
    assert.equal(body.paginacao.total, 2)
    assert.deepEqual(body.dados.map(({ origem }) => origem).sort(), [
      'camara',
      'prefeitura',
    ])
    assert.ok(body.dados.every(({ matricula }) => matricula === '00123'))
    assert.ok(
      body.dados.every(
        ({ credenciado, contemplado }) => !credenciado && !contemplado,
      ),
    )

    response = await request('/api/servidores?matricula=99999')
    body = await response.json()
    assert.equal(body.paginacao.total, 0)
    assert.deepEqual(body.dados, [])

    response = await request('/api/servidores?matricula=00124')
    body = await response.json()
    assert.equal(body.dados.length, 1)
    assert.equal(body.dados[0].nome, 'Ana Silva')

    response = await request('/api/servidores?page=2&limit=2')
    body = await response.json()
    assert.equal(body.dados.length, 2)
    assert.equal(body.paginacao.pagina, 2)
    assert.equal(body.paginacao.paginas, 2)

    response = await request('/api/servidores?limit=101')
    assert.equal(response.status, 400)

    response = await request('/api/credenciamentos/indicadores')
    body = await response.json()
    assert.deepEqual(body, {
      totalServidores: 4,
      presencasConfirmadas: 0,
      servidoresPendentes: 4,
      servidoresContemplados: 0,
    })

    response = await request('/api/health')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: 'ok',
      database: 'connected',
      ambiente: 'configurado',
    })
  } finally {
    await closeTestServer(server)
    db.close()
  }
})

test('confirmation requires matching explicit matrícula and rejects duplicates', async () => {
  const db = createTestDatabase()
  const { server, request } = await startTestServer(db)

  try {
    let response = await request('/api/credenciamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servidorId: 1 }),
    })
    assert.equal(response.status, 400)

    response = await request('/api/credenciamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servidorId: 1, matricula: '00124' }),
    })
    assert.equal(response.status, 400)

    response = await request('/api/credenciamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servidorId: 999, matricula: '99999' }),
    })
    assert.equal(response.status, 404)

    response = await request('/api/credenciamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servidorId: 1, matricula: '00123' }),
    })
    assert.equal(response.status, 201)
    assert.match((await response.json()).mensagem, /confirmada/)

    response = await request('/api/credenciamentos/indicadores')
    assert.deepEqual(await response.json(), {
      totalServidores: 4,
      presencasConfirmadas: 1,
      servidoresPendentes: 3,
      servidoresContemplados: 0,
    })

    response = await request('/api/credenciamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servidorId: 1, matricula: '00123' }),
    })
    assert.equal(response.status, 409)

    assert.equal(
      db.prepare('SELECT COUNT(*) AS total FROM credenciamentos').get().total,
      1,
    )
  } finally {
    await closeTestServer(server)
    db.close()
  }
})

test('presence can be undone unless the server has won a draw', async () => {
  const db = createTestDatabase()
  const { server, request } = await startTestServer(db)

  try {
    await request('/api/credenciamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servidorId: 1, matricula: '00123' }),
    })
    await request('/api/credenciamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servidorId: 2, matricula: '00123' }),
    })

    let response = await request('/api/credenciamentos/1', {
      method: 'DELETE',
    })
    assert.equal(response.status, 200)

    db.prepare('INSERT INTO sorteios (numero, servidor_id) VALUES (?, ?)').run(
      1,
      2,
    )
    response = await request('/api/credenciamentos/2', { method: 'DELETE' })
    assert.equal(response.status, 409)

    response = await request('/api/credenciamentos/3', { method: 'DELETE' })
    assert.equal(response.status, 404)

    response = await request('/api/credenciamentos/999', { method: 'DELETE' })
    assert.equal(response.status, 404)

    assert.equal(
      db.prepare('SELECT COUNT(*) AS total FROM credenciamentos').get().total,
      1,
    )
    assert.equal(
      db.prepare('SELECT COUNT(*) AS total FROM sorteios').get().total,
      1,
    )
  } finally {
    await closeTestServer(server)
    db.close()
  }
})
