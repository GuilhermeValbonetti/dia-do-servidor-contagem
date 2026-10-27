import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  acquireTestLock,
  assertIsolatedTestDatabase,
  officialDatabasePath,
  testDatabasePath,
  testLockPath,
} from './database-environment.js'

if (process.argv.length > 2) {
  throw new Error('O modo de testes não aceita argumentos ou caminhos de banco personalizados.')
}

if (path.resolve(testDatabasePath) === path.resolve(officialDatabasePath)) {
  throw new Error('O caminho do banco de testes coincide com o banco oficial.')
}

if (!existsSync(testDatabasePath) || !statSync(testDatabasePath).isFile()) {
  throw new Error(
    `Banco de testes não encontrado: ${testDatabasePath}. Execute npm run reset:teste para criá-lo.`,
  )
}

assertIsolatedTestDatabase()
const releaseLock = acquireTestLock(testLockPath)
process.on('exit', releaseLock)
process.env.DB_PATH = testDatabasePath

try {
  await import('./server.js')
} catch (error) {
  releaseLock()
  throw error
}
