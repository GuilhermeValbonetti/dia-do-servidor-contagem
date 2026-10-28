import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createApp } from '../src/app.js'
import {
  databaseFingerprint,
  migrateWorkplaces,
} from '../src/migrate-workplaces.js'

const schema = readFileSync(
  new URL('../src/database.js', import.meta.url),
  'utf8',
).match(/db.exec\(`([\s\S]*?)`\)/)[1]
const expected = { prefeitura: 2, camara: 1 }
const records = [
  {
    nome: 'Mesmo Nome',
    matricula: '001',
    codigo: '0008',
    descricao: 'Unidade "A" — ' + 'Descrição longa '.repeat(30),
  },
  {
    nome: 'Outro Nome',
    matricula: '002',
    codigo: '0009',
    descricao: 'Unidade B',
  },
]
function fixture(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(schema)
  db.exec(`INSERT INTO servidores (id,nome,matricula,origem) VALUES
    (1,'Mesmo Nome','001','prefeitura'), (2,'Outro Nome','002','prefeitura'), (3,'Mesmo Nome','001','camara');
    INSERT INTO credenciamentos (servidor_id) VALUES (1), (3);
    INSERT INTO premios (id,nome) VALUES (1,'Prêmio existente');
    INSERT INTO sorteios (numero,servidor_id,premio_id) VALUES (1,1,1);`)
  return db
}

test('workplace migration preserves IDs, history and zeroes, and can be safely repeated', (t) => {
  const db = fixture(t)
  const before = databaseFingerprint(db)
  const result = migrateWorkplaces(db, records, expected)
  assert.equal(result.atualizados, 2)
  assert.equal(result.comLocal, 2)
  assert.deepEqual(databaseFingerprint(db), before)
  const data = db.prepare('SELECT * FROM servidores ORDER BY id').all()
  assert.equal(data[0].local_trabalho_codigo, '0008')
  assert.equal(data[0].local_trabalho_descricao, records[0].descricao)
  assert.equal(data[2].local_trabalho_codigo, null)
  assert.equal(data[2].local_trabalho_descricao, null)
  assert.equal(migrateWorkplaces(db, records, expected).atualizados, 0)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
})

test('ambiguous source, mismatches and conflicting data abort without modifying existing values', (t) => {
  const db = fixture(t)
  const before = databaseFingerprint(db, true)
  for (const invalid of [
    records.slice(0, 1),
    [records[0], records[0]],
    [records[0], { ...records[1], matricula: '999' }],
    [records[0], { ...records[1], nome: 'Divergente' }],
    [records[0], { ...records[1], descricao: '' }],
  ]) {
    assert.throws(() => migrateWorkplaces(db, invalid, expected))
    assert.deepEqual(databaseFingerprint(db, true), before)
    assert.ok(
      !db
        .pragma('table_info(servidores)')
        .some(({ name }) => name === 'local_trabalho_codigo'),
    )
  }
  migrateWorkplaces(db, records, expected)
  const applied = databaseFingerprint(db, true)
  assert.throws(() =>
    migrateWorkplaces(
      db,
      [records[0], { ...records[1], descricao: 'Outro valor' }],
      expected,
    ),
  )
  assert.deepEqual(databaseFingerprint(db, true), applied)
})

test('an update failure rolls back both new columns and prior workplace updates', (t) => {
  const db = fixture(t)
  const before = databaseFingerprint(db, true)
  db.exec(
    "CREATE TRIGGER falha_local BEFORE UPDATE ON servidores WHEN OLD.id = 2 BEGIN SELECT RAISE(ABORT, 'Falha simulada'); END",
  )
  assert.throws(
    () => migrateWorkplaces(db, records, expected),
    /Falha simulada/,
  )
  assert.deepEqual(databaseFingerprint(db, true), before)
  assert.ok(
    !db
      .pragma('table_info(servidores)')
      .some(({ name }) => name === 'local_trabalho_descricao'),
  )
})

async function api(t, db) {
  const server = createApp(db).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return async (route) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${route}`,
    )
    assert.equal(response.status, 200)
    return response.json()
  }
}

for (const migrated of [false, true]) {
  test(`workplace APIs support ${migrated ? 'migrated' : 'legacy read-only'} schema without automatic migrations`, async (t) => {
    const db = fixture(t)
    if (migrated) migrateWorkplaces(db, records, expected)
    const before = databaseFingerprint(db, true)
    db.pragma('query_only = ON')
    const get = await api(t, db)
    const servers = await get('/api/servidores?matricula=001')
    assert.equal(servers.dados.length, 2)
    const prefeitura = servers.dados.find(
      ({ origem }) => origem === 'prefeitura',
    )
    const camara = servers.dados.find(({ origem }) => origem === 'camara')
    assert.equal(
      prefeitura.localTrabalhoDescricao,
      migrated ? records[0].descricao : null,
    )
    assert.equal(prefeitura.localTrabalhoCodigo, migrated ? '0008' : null)
    assert.equal(camara.localTrabalhoDescricao, null)
    const recent = await get('/api/credenciamentos/recentes')
    assert.equal(
      recent.dados.find(({ id }) => id === 1).localTrabalhoDescricao,
      prefeitura.localTrabalhoDescricao,
    )
    const draws = await get('/api/sorteios')
    const winner = await get('/api/sorteios/1')
    assert.equal(
      winner.localTrabalhoDescricao,
      prefeitura.localTrabalhoDescricao,
    )
    assert.equal(winner.participanteId, 1)
    assert.equal(winner.premioNome, 'Prêmio existente')
    assert.deepEqual(draws.dados, [winner])
    assert.deepEqual(databaseFingerprint(db, true), before)
  })
}
