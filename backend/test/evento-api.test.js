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
  const directory = await mkdtemp(path.join(tmpdir(), 'evento-api-'))
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
    fetch(`http://127.0.0.1:${server.address().port}/api${route}`, options)
  const post = (body) =>
    request('', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  return { db, databasePath, request, post }
}

test('event indicators aggregate empty data and changes without modifying existing contracts', async (t) => {
  const { db, request } = await fixture(t)
  const get = async (route) => (await request(route)).json()
  const mutate = async (route, body, method = 'POST') =>
    request(route, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const expected = {
    totalServidores: 0,
    presencasConfirmadas: 0,
    servidoresPendentes: 0,
    elegiveis: 0,
    servidoresContemplados: 0,
    sorteiosRealizados: 0,
    premiosCadastrados: 0,
    premiosUtilizados: 0,
    premiosDisponiveis: 0,
  }
  assert.deepEqual(await get('/evento/indicadores'), expected)
  db.prepare(
    "INSERT INTO servidores (id, nome, matricula, origem) VALUES (1, 'Servidor teste', '001', 'prefeitura'), (2, 'Servidor teste', '001', 'camara'), (3, 'Outro servidor', '002', 'prefeitura')",
  ).run()
  Object.assign(expected, { totalServidores: 3, servidoresPendentes: 3 })
  assert.deepEqual(await get('/evento/indicadores'), expected)
  for (const id of [1, 2])
    assert.equal(
      (await mutate('/credenciamentos', { servidorId: id, matricula: '001' }))
        .status,
      201,
    )
  Object.assign(expected, {
    presencasConfirmadas: 2,
    servidoresPendentes: 1,
    elegiveis: 2,
  })
  assert.deepEqual(await get('/evento/indicadores'), expected)
  assert.equal(
    (await mutate('/credenciamentos/2', undefined, 'DELETE')).status,
    200,
  )
  Object.assign(expected, {
    presencasConfirmadas: 1,
    servidoresPendentes: 2,
    elegiveis: 1,
  })
  assert.deepEqual(await get('/evento/indicadores'), expected)
  const prize = await (
    await mutate('/premios', { nome: 'Prêmio teste' })
  ).json()
  Object.assign(expected, { premiosCadastrados: 1, premiosDisponiveis: 1 })
  assert.deepEqual(await get('/evento/indicadores'), expected)
  assert.equal(
    (
      await mutate('/sorteios', {
        chave: randomUUID(),
        numeroEsperado: 1,
        premioId: prize.id,
      })
    ).status,
    201,
  )
  Object.assign(expected, {
    elegiveis: 0,
    servidoresContemplados: 1,
    sorteiosRealizados: 1,
    premiosDisponiveis: 0,
    premiosUtilizados: 1,
  })
  assert.deepEqual(await get('/evento/indicadores'), expected)
  assert.equal(
    (await mutate('/credenciamentos', { servidorId: 2, matricula: '001' }))
      .status,
    201,
  )
  assert.equal(
    (await mutate('/sorteios', { chave: randomUUID(), numeroEsperado: 2 }))
      .status,
    201,
  )
  Object.assign(expected, {
    presencasConfirmadas: 2,
    servidoresPendentes: 1,
    servidoresContemplados: 2,
    sorteiosRealizados: 2,
  })
  assert.deepEqual(await get('/evento/indicadores'), expected)
  const disposablePrize = await (
    await mutate('/premios', { nome: 'Outra unidade' })
  ).json()
  assert.equal((await get('/evento/indicadores')).premiosDisponiveis, 1)
  assert.equal(
    (await mutate(`/premios/${disposablePrize.id}`, undefined, 'DELETE'))
      .status,
    200,
  )
  assert.deepEqual(await get('/evento/indicadores'), expected)
  const previous = await get('/credenciamentos/indicadores')
  for (const key of Object.keys(previous))
    assert.equal(previous[key], expected[key])
  const history = await get('/sorteios?limit=1')
  assert.equal(history.indicadores.elegiveis, expected.elegiveis)
  assert.equal(history.paginacao.total, expected.sorteiosRealizados)
  const prizes = await get('/premios')
  assert.equal(
    prizes.dados.filter((item) => item.utilizado).length,
    expected.premiosUtilizados,
  )
  db.pragma('query_only = ON')
  assert.deepEqual(await get('/evento/indicadores'), expected)
})
