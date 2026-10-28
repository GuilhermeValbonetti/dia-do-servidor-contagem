import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createApp } from '../src/app.js'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'premios-api-'))
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
      `http://127.0.0.1:${server.address().port}/api/premios${route}`,
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

test('prizes API lists empty data, validates names and persists independent units', async (t) => {
  const { db, databasePath, request, post } = await fixture(t)
  assert.deepEqual(await (await request()).json(), { dados: [] })
  for (const body of [
    {},
    null,
    { nome: null },
    { nome: 1 },
    { nome: [] },
    { nome: {} },
    { nome: ' \t\n ' },
    { nome: 'x'.repeat(91) },
  ]) {
    assert.equal((await post(body)).status, 400)
  }
  const response = await post({ nome: '  Caixa   de\n som  ', utilizado: true })
  assert.equal(response.status, 201)
  const prize = await response.json()
  assert.deepEqual(prize, { id: 1, nome: 'Caixa de som', utilizado: false })
  assert.deepEqual(await (await request()).json(), { dados: [prize] })
  // Prêmios com o mesmo nome representam unidades diferentes e são permitidos.
  assert.equal((await post({ nome: 'Caixa de som' })).status, 201)
  assert.equal((await post({ nome: 'x'.repeat(90) })).status, 201)
  const reopened = new Database(databasePath, { readonly: true })
  try {
    assert.equal(
      reopened.prepare('SELECT COUNT(*) total FROM premios').get().total,
      3,
    )
    const server = createApp(reopened).listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    try {
      const result = await (
        await fetch(`http://127.0.0.1:${server.address().port}/api/premios`)
      ).json()
      assert.equal(result.dados.length, 3)
      assert.ok(result.dados.every((item) => !item.utilizado))
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  } finally {
    reopened.close()
  }
  assert.equal(
    db.prepare('SELECT COUNT(*) total FROM credenciamentos').get().total,
    0,
  )
})

test('prizes API deletes available prizes and rejects invalid, absent and used prizes', async (t) => {
  const { db, request, post } = await fixture(t)
  db.prepare(
    "INSERT INTO servidores (id, nome, matricula, origem) VALUES (1, 'Servidor teste', '001', 'prefeitura')",
  ).run()
  db.prepare('INSERT INTO credenciamentos (servidor_id) VALUES (1)').run()
  const before = db.prepare('SELECT * FROM credenciamentos').all()
  const available = await (await post({ nome: 'Disponível' })).json()
  const used = await (await post({ nome: 'Utilizado' })).json()
  db.prepare(
    'INSERT INTO sorteios (numero, servidor_id, premio_id) VALUES (1, 1, ?)',
  ).run(used.id)
  const list = (await (await request()).json()).dados
  assert.equal(list.find((item) => item.id === used.id).utilizado, true)
  assert.equal(list.find((item) => item.id === available.id).utilizado, false)
  assert.equal((await request(`/${used.id}`, { method: 'DELETE' })).status, 409)
  assert.equal(
    (await request(`/${available.id}`, { method: 'DELETE' })).status,
    200,
  )
  assert.equal(
    (await request(`/${available.id}`, { method: 'DELETE' })).status,
    404,
  )
  assert.equal((await request('/999', { method: 'DELETE' })).status, 404)
  for (const id of ['0', '-1', 'abc', '1.5', '1e0', '9007199254740992']) {
    assert.equal((await request(`/${id}`, { method: 'DELETE' })).status, 400)
  }
  assert.equal(db.prepare('SELECT COUNT(*) total FROM sorteios').get().total, 1)
  assert.deepEqual(db.prepare('SELECT * FROM credenciamentos').all(), before)
  assert.deepEqual((await (await request()).json()).dados, [
    { ...used, utilizado: true },
  ])
})

test('prizes API returns JSON errors for malformed JSON and database failures', async (t) => {
  const { db, request } = await fixture(t)
  const malformed = await request('', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  assert.equal(malformed.status, 400)
  assert.match((await malformed.json()).erro, /JSON/)
  db.pragma('query_only = ON')
  const response = await request('', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nome: 'Falha' }),
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), {
    erro: 'Ocorreu um erro interno ao processar a requisição.',
  })
  assert.deepEqual((await (await request()).json()).dados, [])
})
