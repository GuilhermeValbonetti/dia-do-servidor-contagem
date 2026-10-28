import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createApp } from '../src/app.js'
import { databaseEnvironment } from '../src/database-startup.js'
import { officialDatabasePath, testDatabasePath } from '../src/database-environment.js'

const run = promisify(execFile)
const cwd = new URL('../', import.meta.url)

async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'startup-evento-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return path.join(directory, 'descartavel.sqlite')
}

function start(
  file,
  script = "import db from './src/database.js'; db.close()",
  nodeEnv = 'production',
) {
  return run(process.execPath, ['--input-type=module', '-e', script], {
    cwd,
    env: { ...process.env, NODE_ENV: nodeEnv, DB_PATH: file },
  })
}

test('normal startup rejects missing, empty and incomplete databases without creating or repairing them', async (t) => {
  const file = await temporary(t)
  await assert.rejects(start(file), /Banco SQLite não encontrado/)
  await assert.rejects(readFile(file), { code: 'ENOENT' })
  const db = new Database(file)
  db.close()
  const before = await readFile(file)
  await assert.rejects(start(file), /tabela servidores ausente ou incompleta/)
  assert.deepEqual(await readFile(file), before)
})

test('valid existing database starts API; empty server base is rejected; startup preserves file bytes', async (t) => {
  const file = await temporary(t)
  await start(file, undefined, 'test')
  const db = new Database(file)
  db.exec(
    'ALTER TABLE servidores ADD COLUMN local_trabalho_codigo TEXT; ALTER TABLE servidores ADD COLUMN local_trabalho_descricao TEXT',
  )
  db.close()
  await assert.rejects(start(file), /Banco sem base de servidores/)
  const seeded = new Database(file)
  seeded
    .prepare('INSERT INTO servidores (id,nome,matricula,origem) VALUES (1,?,?,?)')
    .run('Servidor de teste', '0001', 'prefeitura')
  seeded.close()
  const before = await readFile(file)
  const { stdout } = await start(
    file,
    `
    import db from './src/database.js';
    import {createApp} from './src/app.js';
    const server=createApp(db).listen(0,'127.0.0.1');
    await new Promise(r=>server.once('listening',r));
    const result=await fetch('http://127.0.0.1:'+server.address().port+'/api/health');
    console.log(JSON.stringify(await result.json()));
    await new Promise(r=>server.close(r)); db.close();
  `,
  )
  assert.match(stdout, /"status":"ok"/)
  assert.match(stdout, /"ambiente":"configurado"/)
  assert.deepEqual(await readFile(file), before)
})

test('environment metadata distinguishes official and tests without exposing local paths', async () => {
  assert.equal(databaseEnvironment(officialDatabasePath), 'oficial')
  assert.equal(databaseEnvironment(testDatabasePath), 'testes')
  assert.equal(databaseEnvironment(':memory:'), 'configurado')
  const db = new Database(':memory:')
  db.exec('CREATE TABLE servidores (id INTEGER)')
  const server = createApp(db).listen(0, '127.0.0.1')
  try {
    await new Promise((r) => server.once('listening', r))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`)
    assert.deepEqual(await response.json(), {
      status: 'ok',
      database: 'connected',
      ambiente: 'configurado',
    })
  } finally {
    await new Promise((r) => server.close(r))
    db.close()
  }
})
