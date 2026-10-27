import express from 'express'

export function createApp(db) {
  const app = express()

  app.use(express.json({ limit: '10kb' }))

  app.get('/api/health', (_request, response) => {
    try {
      db.prepare('SELECT 1').get()
      response.json({ status: 'ok', database: 'connected' })
    } catch (error) {
      console.error('Falha ao verificar a conexão com o SQLite.', error)
      response.status(503).json({ status: 'error', database: 'disconnected' })
    }
  })

  app.get('/api/servidores', (request, response) => {
    const page = Number(request.query.page ?? 1)
    const limit = Number(request.query.limit ?? 50)
    const matricula = request.query.matricula

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return response.status(400).json({
        erro: 'Parâmetros inválidos. page deve ser positivo e limit deve estar entre 1 e 100.',
      })
    }

    if (matricula !== undefined && (typeof matricula !== 'string' || !/^\d+$/.test(matricula))) {
      return response.status(400).json({ erro: 'Informe uma matrícula numérica válida.' })
    }

    const where = matricula === undefined ? '' : 'WHERE s.matricula = @matricula'
    const parameters = matricula === undefined ? {} : { matricula }
    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM servidores s ${where}`)
      .get(parameters).total
    const servidores = db
      .prepare(`
        SELECT
          s.id,
          s.nome,
          s.matricula,
          s.origem,
          CASE WHEN c.servidor_id IS NULL THEN 0 ELSE 1 END AS credenciado,
          c.confirmado_em AS confirmadoEm,
          CASE WHEN so.servidor_id IS NULL THEN 0 ELSE 1 END AS contemplado
        FROM servidores s
        LEFT JOIN credenciamentos c ON c.servidor_id = s.id
        LEFT JOIN sorteios so ON so.servidor_id = s.id
        ${where}
        ORDER BY s.origem, s.nome, s.id
        LIMIT @limit OFFSET @offset
      `)
      .all({ ...parameters, limit, offset: (page - 1) * limit })

    return response.json({
      dados: servidores,
      paginacao: {
        pagina: page,
        limite: limit,
        total,
        paginas: Math.ceil(total / limit),
      },
    })
  })

  app.post('/api/credenciamentos', (request, response) => {
    const { servidorId, matricula } = request.body ?? {}

    if (!Number.isSafeInteger(servidorId) || servidorId < 1) {
      return response.status(400).json({ erro: 'Informe um ID de servidor válido.' })
    }

    if (typeof matricula !== 'string' || !/^\d+$/.test(matricula)) {
      return response.status(400).json({
        erro: 'Informe a matrícula pesquisada para confirmar o registro selecionado.',
      })
    }

    const servidor = db
      .prepare('SELECT id, matricula FROM servidores WHERE id = ?')
      .get(servidorId)

    if (!servidor) {
      return response.status(404).json({ erro: 'Servidor não encontrado.' })
    }

    if (servidor.matricula !== matricula) {
      return response.status(400).json({
        erro: 'A matrícula informada não corresponde ao servidor selecionado.',
      })
    }

    if (db.prepare('SELECT 1 FROM credenciamentos WHERE servidor_id = ?').get(servidorId)) {
      return response.status(409).json({ erro: 'A presença deste servidor já foi confirmada.' })
    }

    try {
      const result = db
        .prepare('INSERT INTO credenciamentos (servidor_id) VALUES (?)')
        .run(servidorId)
      const credenciamento = db
        .prepare('SELECT confirmado_em AS confirmadoEm FROM credenciamentos WHERE servidor_id = ?')
        .get(servidorId)

      return response.status(201).json({
        mensagem: 'Presença confirmada com sucesso.',
        servidorId: result.lastInsertRowid,
        confirmadoEm: credenciamento.confirmadoEm,
      })
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return response.status(409).json({ erro: 'A presença deste servidor já foi confirmada.' })
      }
      throw error
    }
  })

  app.delete('/api/credenciamentos/:servidorId', (request, response) => {
    const servidorId = Number(request.params.servidorId)

    if (!Number.isSafeInteger(servidorId) || servidorId < 1) {
      return response.status(400).json({ erro: 'Informe um ID de servidor válido.' })
    }

    const servidor = db.prepare('SELECT id FROM servidores WHERE id = ?').get(servidorId)
    if (!servidor) return response.status(404).json({ erro: 'Servidor não encontrado.' })

    const hasDraw = db.prepare('SELECT 1 FROM sorteios WHERE servidor_id = ?').get(servidorId)
    if (hasDraw) {
      return response.status(409).json({
        erro: 'Não é permitido desfazer a presença de um servidor contemplado.',
      })
    }

    const result = db.prepare('DELETE FROM credenciamentos WHERE servidor_id = ?').run(servidorId)
    if (result.changes === 0) {
      return response.status(404).json({ erro: 'Este servidor não possui presença confirmada.' })
    }

    return response.json({ mensagem: 'Confirmação de presença desfeita com sucesso.' })
  })

  app.get('/api/credenciamentos/indicadores', (_request, response) => {
    const indicators = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM servidores) AS totalServidores,
          (SELECT COUNT(*) FROM credenciamentos) AS presencasConfirmadas,
          (SELECT COUNT(*) FROM servidores) -
            (SELECT COUNT(*) FROM credenciamentos) AS servidoresPendentes,
          (SELECT COUNT(*) FROM sorteios) AS servidoresContemplados
      `)
      .get()

    return response.json(indicators)
  })

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ erro: 'O corpo da requisição deve conter JSON válido.' })
    }

    console.error('Falha ao processar requisição da API.', error)
    return response.status(500).json({ erro: 'Ocorreu um erro interno ao processar a requisição.' })
  })

  return app
}
