import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { createApp } from '../src/app.js'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'sorteios-api-'))
  let db
  let server
  t.after(async () => {
    if (server)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    if (db?.open) db.close()
    await rm(directory, { recursive: true, force: true })
  })
  const databasePath = path.join(directory, 'descartavel.sqlite')
  // Inicializa o schema de produção exclusivamente em um arquivo temporário.
  await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import db from './src/database.js'; db.close()",
    ],
    {
      cwd: backendDirectory,
      env: { ...process.env, DB_PATH: databasePath },
    },
  )
  db = new Database(databasePath)
  db.pragma('foreign_keys = ON')
  server = createApp(db).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const request = (route = '', options) =>
    fetch(
      `http://127.0.0.1:${server.address().port}/api/sorteios${route}`,
      options,
    )
  const post = (body) =>
    request('', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  return { db, databasePath, request, post }
}

function seed(db, present = 4) {
  const insert = db.prepare(
    'INSERT INTO servidores (id, nome, matricula, origem) VALUES (?, ?, ?, ?)',
  )
  for (let id = 1; id <= 5; id += 1) {
    insert.run(
      id,
      'Mesmo Nome',
      id <= 2 ? '0001' : `000${id}`,
      id === 2 ? 'camara' : 'prefeitura',
    )
    if (id <= present)
      db.prepare('INSERT INTO credenciamentos (servidor_id) VALUES (?)').run(id)
  }
  db.prepare("INSERT INTO premios (id, nome) VALUES (1, 'Bicicleta')").run()
}
const operation = (numeroEsperado = 1, premioId = null) => ({
  chave: randomUUID(),
  numeroEsperado,
  premioId,
})

test('empty history is read only and invalid or ineligible draws leave no changes', async (t) => {
  const { db, request, post } = await fixture(t)
  let history = await (await request()).json()
  assert.deepEqual(history.dados, [])
  assert.equal(history.indicadores.elegiveis, 0)
  seed(db, 0)
  for (const body of [
    {},
    operation(0),
    operation(1, '1'),
    { ...operation(), chave: 'bad' },
    operation(1, -1),
  ]) {
    assert.equal((await post(body)).status, 400)
  }
  assert.equal((await post(operation())).status, 409)
  assert.equal(db.prepare('SELECT COUNT(*) total FROM sorteios').get().total, 0)
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) total FROM sqlite_master WHERE name='sorteio_solicitacoes'",
      )
      .get().total,
    0,
  )
  for (const route of ['?limit=101', '?page=0', '?chave=bad', '/abc', '/0'])
    assert.equal((await request(route)).status, 400)
  assert.equal((await request('/999')).status, 404)
  history = await (await request('?chave=' + randomUUID())).json()
  assert.deepEqual(history.dados, [])
})

test('draws use only present IDs, protect prizes, preserve history and replay idempotently', async (t) => {
  const { db, request, post } = await fixture(t)
  seed(db)
  const presences = db.prepare('SELECT * FROM credenciamentos').all()
  assert.equal((await post(operation(1, 999))).status, 404)
  const firstOperation = operation(1, 1)
  const firstResponse = await post(firstOperation)
  assert.equal(firstResponse.status, 201)
  const first = await firstResponse.json()
  assert.equal(first.premioNome, 'Bicicleta')
  assert.equal(first.premioId, 1)
  assert.equal(typeof first.sorteadoEm, 'string')
  assert.ok(first.participanteId <= 4)
  const replay = await post(firstOperation)
  assert.equal(replay.status, 200)
  assert.deepEqual(await replay.json(), first)
  assert.deepEqual(await (await request('/' + first.id)).json(), first)
  assert.deepEqual(
    (await (await request('?chave=' + firstOperation.chave)).json()).dados,
    [first],
  )
  assert.equal((await post({ ...firstOperation, premioId: null })).status, 409)
  assert.equal((await post(operation(1))).status, 409)
  assert.equal((await post(operation(2, 1))).status, 409)
  const winners = [first.participanteId]
  for (let number = 2; number <= 4; number += 1) {
    const result = await post(operation(number))
    assert.equal(result.status, 201)
    const draw = await result.json()
    assert.equal(draw.numero, number)
    assert.equal(draw.premioId, null)
    assert.equal(draw.premioNome, null)
    winners.push(draw.participanteId)
  }
  assert.deepEqual(winners.sort(), [1, 2, 3, 4])
  assert.equal((await post(operation(5))).status, 409)
  assert.deepEqual(await (await post(firstOperation)).json(), first)
  const history = await (await request('?page=2&limit=2')).json()
  assert.deepEqual(
    history.dados.map((draw) => draw.numero),
    [2, 1],
  )
  assert.deepEqual(history.indicadores, {
    presencasConfirmadas: 4,
    servidoresContemplados: 4,
    elegiveis: 0,
    proximoNumero: 5,
  })
  assert.deepEqual(history.paginacao, {
    pagina: 2,
    limite: 2,
    total: 4,
    paginas: 2,
  })
  assert.deepEqual(db.prepare('SELECT * FROM credenciamentos').all(), presences)
  assert.throws(() =>
    db.prepare('DELETE FROM sorteios WHERE id = ?').run(first.id),
  )
  assert.throws(() =>
    db
      .prepare('UPDATE sorteios SET premio_id = NULL WHERE id = ?')
      .run(first.id),
  )
  assert.throws(() =>
    db
      .prepare('DELETE FROM credenciamentos WHERE servidor_id = ?')
      .run(first.participanteId),
  )
})

test('two API connections serialize same-round requests and persistent replay survives reopening', async (t) => {
  const { db, databasePath, post } = await fixture(t)
  seed(db)
  const secondDb = new Database(databasePath)
  secondDb.pragma('foreign_keys = ON')
  const server = createApp(secondDb).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const secondPost = (body) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/sorteios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  const body = operation()
  try {
    const duplicates = await Promise.all([
      post(body),
      secondPost(body),
      post(body),
    ])
    assert.deepEqual(
      duplicates.map((response) => response.status).sort(),
      [200, 200, 201],
    )
    const draws = await Promise.all(
      duplicates.map((response) => response.json()),
    )
    assert.ok(draws.every((draw) => draw.id === draws[0].id))
    const simultaneous = await Promise.all([
      post(operation(2, 1)),
      secondPost(operation(2, 1)),
    ])
    assert.deepEqual(
      simultaneous.map((response) => response.status).sort(),
      [201, 409],
    )
    assert.equal(
      db.prepare('SELECT COUNT(*) total FROM sorteios').get().total,
      2,
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
    secondDb.close()
  }
  db.close()
  const reopened = new Database(databasePath)
  const recoveredApi = createApp(reopened).listen(0, '127.0.0.1')
  await new Promise((resolve) => recoveredApi.once('listening', resolve))
  try {
    const response = await fetch(
      `http://127.0.0.1:${recoveredApi.address().port}/api/sorteios`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    assert.equal(response.status, 200)
    assert.equal((await response.json()).numero, 1)
    assert.equal(
      reopened.prepare('SELECT COUNT(*) total FROM sorteios').get().total,
      2,
    )
  } finally {
    await new Promise((resolve) => recoveredApi.close(resolve))
    reopened.close()
  }
})

test('failure after choosing and inserting a winner rolls back the entire operation', async (t) => {
  const { db, post, request } = await fixture(t)
  seed(db)
  assert.equal((await post(operation())).status, 201)
  db.exec(`CREATE TRIGGER simular_falha BEFORE INSERT ON sorteio_solicitacoes
    BEGIN SELECT RAISE(ABORT, 'Falha de teste'); END;`)
  const body = operation(2, 1)
  assert.equal((await post(body)).status, 500)
  assert.equal(db.prepare('SELECT COUNT(*) total FROM sorteios').get().total, 1)
  assert.equal(
    db.prepare('SELECT COUNT(*) total FROM sorteio_solicitacoes').get().total,
    1,
  )
  assert.equal((await (await request()).json()).indicadores.elegiveis, 3)
  db.exec('DROP TRIGGER simular_falha')
  assert.equal((await post(body)).status, 201)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})
