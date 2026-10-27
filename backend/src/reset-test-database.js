import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  acquireTestLock,
  assertProtectedBase,
  copyCleanDatabase,
  officialDatabasePath,
  testBasePath,
  testDatabasePath,
  testLockPath,
} from './database-environment.js'

if (process.argv.length > 2) {
  throw new Error('O comando de restauração não aceita argumentos ou caminhos personalizados.')
}

const dataDirectory = path.dirname(testDatabasePath)
const expectedPaths = {
  official: path.join(dataDirectory, 'dia-do-servidor.sqlite'),
  test: path.join(dataDirectory, 'dia-do-servidor-teste.sqlite'),
  base: path.join(dataDirectory, 'dia-do-servidor-teste-base.sqlite'),
}

if (
  path.resolve(expectedPaths.official) !== path.resolve(officialDatabasePath) ||
  path.resolve(expectedPaths.test) !== path.resolve(testDatabasePath) ||
  path.resolve(expectedPaths.base) !== path.resolve(testBasePath) ||
  path.resolve(testBasePath) === path.resolve(officialDatabasePath) ||
  path.resolve(testDatabasePath) === path.resolve(officialDatabasePath) ||
  path.resolve(testBasePath) === path.resolve(testDatabasePath)
) {
  throw new Error('Os caminhos fixos de banco não passaram na validação de segurança.')
}

if (!existsSync(testBasePath) || !statSync(testBasePath).isFile()) {
  throw new Error(`Cópia-base limpa não encontrada: ${testBasePath}`)
}

assertProtectedBase()
const releaseLock = acquireTestLock(testLockPath)
try {
  const summary = await copyCleanDatabase(testBasePath, testDatabasePath)
  console.log(`Banco de testes restaurado com sucesso: ${testDatabasePath}`)
  console.log(`Cópia-base protegida: ${testBasePath}`)
  console.log(JSON.stringify(summary))
} finally {
  releaseLock()
}
