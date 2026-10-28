import path from 'node:path'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { officialDatabasePath, testDatabasePath, testBasePath } from './database-environment.js'

const canonical = (file) => (existsSync(file) ? realpathSync(file) : path.resolve(file))

export function databaseEnvironment(file) {
  if (!file || file === ':memory:') return 'configurado'
  const selected = canonical(file)
  if (selected === canonical(officialDatabasePath)) return 'oficial'
  if (selected === canonical(testDatabasePath)) return 'testes'
  return 'configurado'
}

export function isPersistentDatabase(file) {
  return [officialDatabasePath, testDatabasePath, testBasePath].some(
    (target) => canonical(target) === canonical(file),
  )
}

export function validateExistingDatabase(db) {
  const required = {
    servidores: [
      'id',
      'nome',
      'matricula',
      'origem',
      'cpf',
      'local_trabalho_codigo',
      'local_trabalho_descricao',
    ],
    credenciamentos: ['servidor_id', 'confirmado_em'],
    premios: ['id', 'nome'],
    sorteios: ['id', 'numero', 'servidor_id', 'premio_id', 'sorteado_em'],
  }
  for (const [table, columns] of Object.entries(required)) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
      throw new Error(`Banco inválido: tabela ${table} ausente ou incompleta. API não iniciada.`)
    const actual = new Set(db.pragma(`table_info(${table})`).map(({ name }) => name))
    if (columns.some((column) => !actual.has(column)))
      throw new Error(`Banco inválido: tabela ${table} ausente ou incompleta. API não iniciada.`)
  }
  if (!db.prepare('SELECT 1 FROM servidores LIMIT 1').get())
    throw new Error('Banco sem base de servidores. API não iniciada; transfira a base validada.')
}

export function assertExistingDatabase(file) {
  if (!existsSync(file) || !statSync(file).isFile())
    throw new Error(
      `Banco SQLite não encontrado: ${file}. Confira DB_PATH e transfira o arquivo validado. Nenhum banco foi criado.`,
    )
  if (canonical(file) === canonical(testBasePath))
    throw new Error('A base limpa de restauração não pode ser usada como banco da API.')
}
