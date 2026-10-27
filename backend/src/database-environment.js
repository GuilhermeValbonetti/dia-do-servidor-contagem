import Database from 'better-sqlite3'
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
export const testDatabasePath = path.join(backendDirectory, 'data', 'dia-do-servidor-teste.sqlite')
export const testBasePath = path.join(path.dirname(testDatabasePath), 'dia-do-servidor-teste-base.sqlite')
export const officialDatabasePath = path.join(backendDirectory, 'data', 'dia-do-servidor.sqlite')
export const testLockPath = path.join(backendDirectory, 'data', '.dia-do-servidor-teste.lock')

function canonicalPath(filePath) {
  const resolvedPath = path.resolve(filePath)
  if (existsSync(resolvedPath)) return realpathSync(resolvedPath)
  return path.join(realpathSync(path.dirname(resolvedPath)), path.basename(resolvedPath))
}

export function assertIsolatedTestDatabase() {
  if (lstatSync(testDatabasePath).isSymbolicLink()) {
    throw new Error('O banco de testes não pode ser um link para outro arquivo.')
  }

  const testStats = statSync(testDatabasePath)
  const officialStats = statSync(officialDatabasePath)
  if (
    canonicalPath(testDatabasePath) === canonicalPath(officialDatabasePath) ||
    (testStats.dev === officialStats.dev && testStats.ino === officialStats.ino)
  ) {
    throw new Error('O banco de testes aponta para o arquivo oficial; operação cancelada.')
  }
}

export function assertProtectedBase() {
  if (!existsSync(testBasePath) || lstatSync(testBasePath).isSymbolicLink()) {
    throw new Error(`Cópia-base ausente ou inválida: ${testBasePath}`)
  }

  const baseStats = statSync(testBasePath)
  const officialStats = statSync(officialDatabasePath)
  const testStats = existsSync(testDatabasePath) ? statSync(testDatabasePath) : null
  if (
    (baseStats.mode & 0o222) !== 0 ||
    canonicalPath(testBasePath) === canonicalPath(officialDatabasePath) ||
    (baseStats.dev === officialStats.dev && baseStats.ino === officialStats.ino) ||
    (testStats && baseStats.dev === testStats.dev && baseStats.ino === testStats.ino)
  ) {
    throw new Error('A cópia-base não está protegida contra gravação ou aponta para o banco oficial.')
  }

  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (existsSync(`${testBasePath}${suffix}`)) {
      throw new Error('A cópia-base possui arquivos auxiliares SQLite inesperados.')
    }
  }
}

export function acquireTestLock(lockPath = testLockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, 'wx')
      writeSync(descriptor, `${process.pid}\n`)
      let released = false

      return () => {
        if (released) return
        released = true
        closeSync(descriptor)
        if (existsSync(lockPath) && Number(readFileSync(lockPath, 'utf8')) === process.pid) {
          unlinkSync(lockPath)
        }
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error

      const lockContents = readFileSync(lockPath, 'utf8').trim()
      const ownerPid = Number(lockContents)
      if (!Number.isSafeInteger(ownerPid) || ownerPid < 1) {
        throw new Error('O estado do ambiente de testes está indefinido; verifique o arquivo de bloqueio.')
      }

      try {
        process.kill(ownerPid, 0)
        throw new Error('O ambiente de testes está em uso. Encerre a API antes de continuar.')
      } catch (processError) {
        if (processError.code !== 'ESRCH') throw processError
      }

      unlinkSync(lockPath)
    }
  }

  throw new Error('Não foi possível bloquear o ambiente de testes.')
}

export function getDatabaseSummary(db) {
  return {
    totalServidores: db.prepare('SELECT COUNT(*) AS total FROM servidores').get().total,
    prefeitura: db
      .prepare("SELECT COUNT(*) AS total FROM servidores WHERE origem = 'prefeitura'")
      .get().total,
    camara: db.prepare("SELECT COUNT(*) AS total FROM servidores WHERE origem = 'camara'").get()
      .total,
    credenciamentos: db.prepare('SELECT COUNT(*) AS total FROM credenciamentos').get().total,
    premios: db.prepare('SELECT COUNT(*) AS total FROM premios').get().total,
    sorteios: db.prepare('SELECT COUNT(*) AS total FROM sorteios').get().total,
    integridade: db.pragma('integrity_check', { simple: true }),
  }
}

export function validateCleanDatabase(db) {
  const summary = getDatabaseSummary(db)
  const valid =
    summary.totalServidores === 13305 &&
    summary.prefeitura === 13138 &&
    summary.camara === 167 &&
    summary.credenciamentos === 0 &&
    summary.premios === 0 &&
    summary.sorteios === 0 &&
    summary.integridade === 'ok'

  if (!valid) {
    throw new Error(`O banco-base não está limpo ou íntegro: ${JSON.stringify(summary)}`)
  }

  return summary
}

function getSchema(db) {
  return db
    .prepare(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `)
    .all()
}

function prepareTargetForBackup(targetPath) {
  if (!existsSync(targetPath)) {
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const sidecar = `${targetPath}${suffix}`
      if (existsSync(sidecar)) unlinkSync(sidecar)
    }
    return
  }

  if (lstatSync(targetPath).isSymbolicLink()) {
    throw new Error('O banco de destino não pode ser um link para outro arquivo.')
  }

  const targetStats = statSync(targetPath)
  const officialStats = statSync(officialDatabasePath)
  if (
    canonicalPath(targetPath) === canonicalPath(officialDatabasePath) ||
    (targetStats.dev === officialStats.dev && targetStats.ino === officialStats.ino)
  ) {
    throw new Error('O banco de destino aponta para o arquivo oficial; operação cancelada.')
  }

  const target = new Database(targetPath)
  try {
    const checkpoint = target.pragma('wal_checkpoint(TRUNCATE)')[0]
    if (checkpoint.busy) {
      throw new Error('O banco de testes não pôde ser bloqueado; verifique se ainda está em uso.')
    }
    target.pragma('journal_mode = DELETE')
  } finally {
    target.close()
  }

  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = `${targetPath}${suffix}`
    if (existsSync(sidecar)) unlinkSync(sidecar)
  }
}

export async function copyCleanDatabase(sourcePath, targetPath) {
  const sourceRealPath = path.resolve(sourcePath)
  const targetRealPath = path.resolve(targetPath)

  if (sourceRealPath === targetRealPath || targetRealPath === path.resolve(officialDatabasePath)) {
    throw new Error('Caminho de destino inválido para operação de banco de testes.')
  }
  if (existsSync(targetRealPath) && lstatSync(targetRealPath).isSymbolicLink()) {
    throw new Error('O banco de destino não pode ser um link para outro arquivo.')
  }

  const source = new Database(sourceRealPath, { readonly: true, fileMustExist: true })
  try {
    validateCleanDatabase(source)
    const sourceSchema = getSchema(source)
    if (existsSync(targetRealPath)) {
      const sourceStats = statSync(sourceRealPath)
      const targetStats = statSync(targetRealPath)
      if (sourceStats.dev === targetStats.dev && sourceStats.ino === targetStats.ino) {
        throw new Error('A cópia-base e o banco de destino não podem ser o mesmo arquivo.')
      }
    }
    prepareTargetForBackup(targetRealPath)
    await source.backup(targetRealPath)

    const target = new Database(targetRealPath)
    try {
      const targetSummary = validateCleanDatabase(target)
      if (JSON.stringify(sourceSchema) !== JSON.stringify(getSchema(target))) {
        throw new Error('O schema do banco restaurado não corresponde ao banco-base.')
      }
      target.pragma('journal_mode = DELETE')
      return targetSummary
    } finally {
      target.close()
    }
  } finally {
    source.close()
  }
}
