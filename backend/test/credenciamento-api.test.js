import assert from 'node:assert/strict'
import test from 'node:test'
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
  db.prepare('INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)').run(
    1,
    'Ana Silva',
    '00123',
    'prefeitura',
  )
  db.prepare('INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)').run(
    2,
    'Bruno Silva',
    '00123',
    'camara',
  )
  db.prepare('INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)').run(
    3,
    'Ana Silva',
    '00124',
    'prefeitura',
  )
  db.prepare('INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)').run(
    4,
    'Carla Souza',
    '00125',
    'prefeitura',
  )
  return db
}

async function startTestServer(db) {
  const server = createApp(db).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()

  return {
    server,
    request: (route, options) => fetch(`http://127.0.0.1:${address.port}${route}`, options),
  }
}

async function closeTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

test('credenciamento API supports search, duplicate institutions, pagination, and indicators', async () => {
  const db = createTestDatabase()
  const { server, request } = await startTestServer(db)

  try {
    let response = await request('/api/servidores?matricula=00123')
    assert.equal(response.status, 200)
    let body = await response.json()
    assert.equal(body.paginacao.total, 2)
    assert.deepEqual(
      body.dados.map(({ origem }) => origem).sort(),
      ['camara', 'prefeitura'],
    )
    assert.ok(body.dados.every(({ matricula }) => matricula === '00123'))
    assert.ok(body.dados.every(({ credenciado, contemplado }) => !credenciado && !contemplado))

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
    assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' })
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

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM credenciamentos').get().total, 1)
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

    let response = await request('/api/credenciamentos/1', { method: 'DELETE' })
    assert.equal(response.status, 200)

    db.prepare('INSERT INTO sorteios (numero, servidor_id) VALUES (?, ?)').run(1, 2)
    response = await request('/api/credenciamentos/2', { method: 'DELETE' })
    assert.equal(response.status, 409)

    response = await request('/api/credenciamentos/3', { method: 'DELETE' })
    assert.equal(response.status, 404)

    response = await request('/api/credenciamentos/999', { method: 'DELETE' })
    assert.equal(response.status, 404)

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM credenciamentos').get().total, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sorteios').get().total, 1)
  } finally {
    await closeTestServer(server)
    db.close()
  }
})
