import { createApp } from './app.js'
import {
  databasePath,
  officialDatabasePath,
  testDatabasePath,
  default as db,
} from './database.js'

const app = createApp(db)
const host = '127.0.0.1'
const port = Number(process.env.PORT) || 3000
const mode =
  databasePath === testDatabasePath
    ? 'TESTES'
    : databasePath === officialDatabasePath
      ? 'OFICIAL'
      : 'CONFIGURADO'

const server = app.listen(port, host, () => {
  console.log(`API disponível em http://${host}:${port}`)
  console.log(`Banco ${mode}: ${databasePath}`)
})

export { server }

function closeServer() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', closeServer)
process.on('SIGTERM', closeServer)
