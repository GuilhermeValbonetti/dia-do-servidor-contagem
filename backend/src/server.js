import express from 'express'
import db from './database.js'

const app = express()
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT) || 3000

app.get('/api/health', (_request, response) => {
  try {
    db.prepare('SELECT 1').get()
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    console.error('Falha ao verificar a conexão com o SQLite.', error)
    response.status(503).json({ status: 'error', database: 'disconnected' })
  }
})

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
