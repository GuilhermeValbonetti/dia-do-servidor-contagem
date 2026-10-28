import { createApp } from './app.js'
import { databaseEnvironment } from './database-startup.js'
import { databasePath, default as db } from './database.js'

console.log(`Banco ${databaseEnvironment(databasePath).toUpperCase()}: ${databasePath}`)
const app = createApp(db)
const host = '127.0.0.1'
const port = Number(process.env.PORT) || 3000

const server = app.listen(port, host, () => {
  console.log(`API disponível em http://${host}:${port}`)
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
