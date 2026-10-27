import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  acquireTestLock,
  copyCleanDatabase,
  getDatabaseSummary,
  validateCleanDatabase,
} from '../src/database-environment.js'

const temporaryDirectories = []

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dia-servidor-reset-'))
  temporaryDirectories.push(directory)
  return directory
}

function createCleanDatabase(filePath) {
  const db = new Database(filePath)
  db.exec(`
    CREATE TABLE servidores (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      matricula TEXT NOT NULL,
      origem TEXT NOT NULL CHECK (origem IN ('prefeitura', 'camara')),
      UNIQUE (origem, matricula)
    );
    CREATE TABLE credenciamentos (
      servidor_id INTEGER PRIMARY KEY REFERENCES servidores(id),
      confirmado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE premios (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL
    );
    CREATE TABLE sorteios (
      id INTEGER PRIMARY KEY,
      numero INTEGER NOT NULL UNIQUE,
      servidor_id INTEGER NOT NULL UNIQUE REFERENCES servidores(id),
      premio_id INTEGER UNIQUE REFERENCES premios(id)
    );
  `)

  const insert = db.prepare('INSERT INTO servidores (nome, matricula, origem) VALUES (?, ?, ?)')
  const addServers = db.transaction(() => {
    for (let index = 1; index <= 13138; index += 1) {
      insert.run(`Servidor Prefeitura ${index}`, String(index), 'prefeitura')
    }
    for (let index = 1; index <= 167; index += 1) {
      insert.run(`Servidor Câmara ${index}`, String(index), 'camara')
    }
  })
  addServers()
  return db
}

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })))
})

test('backs up and restores only the disposable database from a clean base', async () => {
  const directory = await createTemporaryDirectory()
  const basePath = path.join(directory, 'base.sqlite')
  const testPath = path.join(directory, 'test.sqlite')
  const base = createCleanDatabase(basePath)

  try {
    validateCleanDatabase(base)
  } finally {
    base.close()
  }

  assert.deepEqual(await copyCleanDatabase(basePath, testPath), {
    totalServidores: 13305,
    prefeitura: 13138,
    camara: 167,
    credenciamentos: 0,
    premios: 0,
    sorteios: 0,
    integridade: 'ok',
  })

  const testDb = new Database(testPath)
  testDb.prepare('INSERT INTO credenciamentos (servidor_id) VALUES (?)').run(1)
  testDb.prepare('INSERT INTO premios (nome) VALUES (?)').run('Prêmio de teste')
  testDb.close()

  assert.equal((await copyCleanDatabase(basePath, testPath)).credenciamentos, 0)
  const restored = new Database(testPath, { readonly: true })
  const unchangedBase = new Database(basePath, { readonly: true })
  try {
    assert.deepEqual(getDatabaseSummary(restored), getDatabaseSummary(unchangedBase))
    for (const suffix of ['-wal', '-shm', '-journal']) {
      assert.equal(existsSync(`${testPath}${suffix}`), false)
    }
  } finally {
    restored.close()
    unchangedBase.close()
  }
})

test('test database lock prevents reset while the test API is active', async () => {
  const directory = await createTemporaryDirectory()
  const lockPath = path.join(directory, 'test.lock')
  const release = acquireTestLock(lockPath)

  try {
    assert.throws(() => acquireTestLock(lockPath), /ambiente de testes está em uso/)
  } finally {
    release()
  }

  const releaseAfterShutdown = acquireTestLock(lockPath)
  releaseAfterShutdown()
})

test('reset command rejects caller-supplied database paths', () => {
  const resetScript = fileURLToPath(new URL('../src/reset-test-database.js', import.meta.url))
  const result = spawnSync(process.execPath, [resetScript, '--db-path', 'data/dia-do-servidor.sqlite'], {
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /não aceita argumentos ou caminhos personalizados/)
})
