import { randomInt } from 'node:crypto'
import { workplaceFields } from './workplace-fields.js'

const selectDraw = (db) => `
  SELECT so.id, so.numero, so.servidor_id AS participanteId,
    s.nome, s.matricula, s.origem, so.sorteado_em AS sorteadoEm,
    so.premio_id AS premioId, p.nome AS premioNome, ${workplaceFields(db)}
  FROM sorteios so JOIN servidores s ON s.id = so.servidor_id
  LEFT JOIN premios p ON p.id = so.premio_id 
`
const eligibleWhere = `FROM credenciamentos c
  WHERE NOT EXISTS (SELECT 1 FROM sorteios so WHERE so.servidor_id = c.servidor_id)`
const validKey = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value)
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}

export function registerDrawRoutes(app, db) {
  const drawSelect = selectDraw(db)
  app.get('/api/sorteios', (request, response) => {
    const page = Number(request.query.page ?? 1)
    const limit = Number(request.query.limit ?? 20)
    const chave = request.query.chave
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (chave !== undefined && !validKey(chave))
    ) {
      return response
        .status(400)
        .json({ erro: 'Paginação ou chave de operação inválida.' })
    }
    const result = db.transaction(() => {
      const total = db
        .prepare('SELECT COUNT(*) total FROM sorteios')
        .get().total
      let dados
      if (chave !== undefined) {
        const exists = db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sorteio_solicitacoes'",
          )
          .get()
        dados = exists
          ? db
              .prepare(
                `${drawSelect} WHERE so.id =
          (SELECT sorteio_id FROM sorteio_solicitacoes WHERE chave = ?)`,
              )
              .all(chave)
          : []
      } else {
        dados = db
          .prepare(`${drawSelect} ORDER BY so.numero DESC LIMIT ? OFFSET ?`)
          .all(limit, (page - 1) * limit)
      }
      const indicadores = db
        .prepare(
          `SELECT
        (SELECT COUNT(*) FROM credenciamentos) AS presencasConfirmadas,
        (SELECT COUNT(*) FROM sorteios) AS servidoresContemplados,
        (SELECT COUNT(*) ${eligibleWhere}) AS elegiveis,
        COALESCE((SELECT MAX(numero) + 1 FROM sorteios), 1) AS proximoNumero`,
        )
        .get()
      return {
        dados,
        indicadores,
        paginacao: {
          pagina: page,
          limite: limit,
          total: chave === undefined ? total : dados.length,
          paginas: Math.ceil(
            (chave === undefined ? total : dados.length) / limit,
          ),
        },
      }
    })()
    return response.json(result)
  })

  app.get('/api/sorteios/:id', (request, response) => {
    const id = Number(request.params.id)
    if (
      !/^\d+$/.test(request.params.id) ||
      !Number.isSafeInteger(id) ||
      id < 1
    ) {
      return response.status(400).json({ erro: 'ID de sorteio inválido.' })
    }
    const draw = db.prepare(`${drawSelect} WHERE so.id = ?`).get(id)
    if (!draw)
      return response.status(404).json({ erro: 'Sorteio não encontrado.' })
    return response.json(draw)
  })

  app.post('/api/sorteios', (request, response, next) => {
    const { chave, numeroEsperado, premioId = null } = request.body ?? {}
    if (
      !validKey(chave) ||
      !Number.isSafeInteger(numeroEsperado) ||
      numeroEsperado < 1 ||
      (premioId !== null && (!Number.isSafeInteger(premioId) || premioId < 1))
    ) {
      return response.status(400).json({
        erro: 'Informe chave, número esperado e prêmio opcional válidos.',
      })
    }
    try {
      const result = db
        .transaction(() => {
          // Migração aditiva sob demanda: GET e inicialização não escrevem nos bancos existentes.
          db.exec(`CREATE TABLE IF NOT EXISTS sorteio_solicitacoes (
          chave TEXT PRIMARY KEY NOT NULL,
          sorteio_id INTEGER NOT NULL UNIQUE REFERENCES sorteios(id) ON DELETE RESTRICT
        )`)
          const previous = db
            .prepare(
              `${drawSelect} WHERE so.id =
          (SELECT sorteio_id FROM sorteio_solicitacoes WHERE chave = ?)`,
            )
            .get(chave)
          if (previous) {
            if (
              previous.premioId !== premioId ||
              previous.numero !== numeroEsperado
            ) {
              fail(
                409,
                'Esta chave já identifica outra solicitação de sorteio.',
              )
            }
            return { draw: previous, repeated: true }
          }
          const numero = db
            .prepare('SELECT COALESCE(MAX(numero), 0) + 1 numero FROM sorteios')
            .get().numero
          if (numero !== numeroEsperado)
            fail(
              409,
              'Esta rodada já foi realizada. Atualize os dados antes de iniciar outra.',
            )
          if (premioId !== null) {
            if (!db.prepare('SELECT 1 FROM premios WHERE id = ?').get(premioId))
              fail(404, 'Prêmio não encontrado.')
            if (
              db
                .prepare('SELECT 1 FROM sorteios WHERE premio_id = ?')
                .get(premioId)
            )
              fail(409, 'Este prêmio já foi utilizado.')
          }
          const total = db
            .prepare(`SELECT COUNT(*) total ${eligibleWhere}`)
            .get().total
          if (!total)
            fail(409, 'Não há participantes elegíveis para o sorteio.')
          const winner = db
            .prepare(
              `SELECT c.servidor_id ${eligibleWhere} ORDER BY c.servidor_id LIMIT 1 OFFSET ?`,
            )
            .get(randomInt(total))
          const inserted = db
            .prepare(
              'INSERT INTO sorteios (numero, servidor_id, premio_id) VALUES (?, ?, ?)',
            )
            .run(numero, winner.servidor_id, premioId)
          db.prepare(
            'INSERT INTO sorteio_solicitacoes (chave, sorteio_id) VALUES (?, ?)',
          ).run(chave, inserted.lastInsertRowid)
          return {
            draw: db
              .prepare(`${drawSelect} WHERE so.id = ?`)
              .get(inserted.lastInsertRowid),
            repeated: false,
          }
        })
        .immediate()
      return response.status(result.repeated ? 200 : 201).json(result.draw)
    } catch (error) {
      if ([404, 409].includes(error.status))
        return response.status(error.status).json({ erro: error.message })
      if (
        error.code === 'SQLITE_BUSY' ||
        error.code === 'SQLITE_BUSY_SNAPSHOT'
      ) {
        return response.status(503).json({
          erro: 'Banco ocupado. Repita a mesma operação para recuperar o resultado.',
        })
      }
      return next(error)
    }
  })
}
