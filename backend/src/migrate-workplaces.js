import Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  acquireTestLock,
  assertIsolatedTestDatabase,
  testDatabasePath,
} from './database-environment.js'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
const sourcePath = path.resolve(
  backendDirectory,
  '../arquivos funcionarios/Servidores_Ativos_Corrigido.xlsx',
)
const newColumns = ['local_trabalho_codigo', 'local_trabalho_descricao']

export async function readWorkplaces(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheets = workbook.worksheets.filter((sheet) =>
    [
      'FOLHA',
      'NOME',
      'MATRICULA',
      'COD LOCAL DE TRABALHO',
      'DESCR LOCAL DE TRABALHO',
    ].every(
      (header, index) =>
        sheet
          .getRow(1)
          .getCell(index + 1)
          .text.trim() === header,
    ),
  )
  if (sheets.length !== 1)
    throw new Error('Planilha ou cabeçalhos inesperados; operação cancelada.')
  const records = []
  const sheet = sheets[0]
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index)
    const [nome, matricula, codigo, descricao] = [2, 3, 4, 5].map((column) =>
      row.getCell(column).text.trim(),
    )
    if ([nome, matricula, codigo, descricao].every((value) => !value)) continue
    records.push({ nome, matricula, codigo, descricao })
  }
  return records
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function databaseFingerprint(db, includeWorkplaces = false) {
  const result = {}
  for (const { name } of db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()) {
    const table = `"${name.replaceAll('"', '""')}"`
    const columns = db
      .pragma(`table_info(${table})`)
      .map(({ name: column }) => column)
      .filter(
        (column) =>
          includeWorkplaces ||
          name !== 'servidores' ||
          !newColumns.includes(column),
      )
    const selected = columns
      .map((column) => `"${column.replaceAll('"', '""')}"`)
      .join(', ')
    const rows = db
      .prepare(`SELECT ${selected} FROM ${table} ORDER BY rowid`)
      .all()
    result[name] = { total: rows.length, sha256: digest(rows) }
  }
  return result
}

export function validateWorkplaces(
  db,
  records,
  expected = { prefeitura: 13138, camara: 167 },
) {
  if (
    records.length !== expected.prefeitura ||
    new Set(records.map(({ matricula }) => matricula)).size !==
      records.length ||
    records.some(
      ({ nome, matricula, codigo, descricao }) =>
        !nome || !/^\d+$/.test(matricula) || !codigo || !descricao,
    )
  ) {
    throw new Error(
      'Fonte incompleta, inválida ou com matrículas duplicadas; operação cancelada.',
    )
  }
  const existing = db
    .prepare('SELECT id, nome, matricula, origem FROM servidores')
    .all()
  const prefeitura = existing.filter(({ origem }) => origem === 'prefeitura')
  if (
    prefeitura.length !== expected.prefeitura ||
    existing.length !== expected.prefeitura + expected.camara ||
    existing.filter(({ origem }) => origem === 'camara').length !==
      expected.camara
  ) {
    throw new Error('Totais do banco divergentes; operação cancelada.')
  }
  const matches = new Map(
    prefeitura.map((server) => [server.matricula, server]),
  )
  if (
    records.some(
      (record) =>
        !matches.has(record.matricula) ||
        matches.get(record.matricula).nome !== record.nome,
    )
  ) {
    throw new Error(
      'Correspondência de matrícula/origem ou conferência de nome divergente; operação cancelada.',
    )
  }
  for (const column of db.pragma('table_info(servidores)')) {
    if (
      newColumns.includes(column.name) &&
      (column.type !== 'TEXT' || column.notnull)
    )
      throw new Error('Coluna de local incompatível.')
  }
  const columns = new Set(
    db.pragma('table_info(servidores)').map(({ name }) => name),
  )
  for (const [column, key] of [
    ['local_trabalho_codigo', 'codigo'],
    ['local_trabalho_descricao', 'descricao'],
  ]) {
    if (!columns.has(column)) continue
    const current = new Map(
      db
        .prepare(
          `SELECT matricula, ${column} valor FROM servidores WHERE origem = 'prefeitura'`,
        )
        .all()
        .map((row) => [row.matricula, row.valor]),
    )
    if (
      records.some(
        (record) =>
          current.get(record.matricula) !== null &&
          current.get(record.matricula) !== record[key],
      ) ||
      db
        .prepare(
          `SELECT 1 FROM servidores WHERE origem = 'camara' AND ${column} IS NOT NULL`,
        )
        .get()
    ) {
      throw new Error(
        'Há dados complementares conflitantes; operação cancelada.',
      )
    }
  }
  if (
    db.pragma('integrity_check', { simple: true }) !== 'ok' ||
    db.pragma('foreign_key_check').length
  )
    throw new Error('Banco sem integridade; operação cancelada.')
  return {
    prefeitura: prefeitura.length,
    camara: expected.camara,
    correspondencias: records.length,
    semCorrespondencia: 0,
  }
}

export function migrateWorkplaces(db, records, expected) {
  return db
    .transaction(() => {
      const report = validateWorkplaces(db, records, expected)
      const before = databaseFingerprint(db)
      const columns = new Set(
        db.pragma('table_info(servidores)').map(({ name }) => name),
      )
      for (const column of newColumns)
        if (!columns.has(column))
          db.exec(`ALTER TABLE servidores ADD COLUMN ${column} TEXT`)
      const update =
        db.prepare(`UPDATE servidores SET local_trabalho_codigo = @codigo,
      local_trabalho_descricao = @descricao WHERE origem = 'prefeitura' AND matricula = @matricula
      AND (local_trabalho_codigo IS NULL OR local_trabalho_descricao IS NULL)`)
      let updated = 0
      for (const record of records) updated += update.run(record).changes
      validateWorkplaces(db, records, expected)
      const complete = db
        .prepare(
          "SELECT COUNT(*) total FROM servidores WHERE origem = 'prefeitura' AND local_trabalho_codigo IS NOT NULL AND local_trabalho_descricao IS NOT NULL",
        )
        .get().total
      if (
        complete !== report.prefeitura ||
        digest(before) !== digest(databaseFingerprint(db))
      )
        throw new Error(
          'Falha de preservação dos registros; transação cancelada.',
        )
      return {
        ...report,
        atualizados: updated,
        comLocal: complete,
        integridade: 'ok',
        errosChavesEstrangeiras: 0,
        preservacao: before,
      }
    })
    .immediate()
}

async function main() {
  const mode = process.argv[2]
  if (
    process.argv.length !== 3 ||
    !['--preview', '--validate-copy', '--apply-test'].includes(mode)
  )
    throw new Error(
      'Use --preview, --validate-copy ou --apply-test. Caminhos de banco personalizados não são aceitos.',
    )
  assertIsolatedTestDatabase()
  const records = await readWorkplaces(sourcePath)
  const source = new Database(testDatabasePath, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    console.log(JSON.stringify(validateWorkplaces(source, records)))
    if (mode === '--preview') return
  } finally {
    source.close()
  }
  const release = acquireTestLock()
  try {
    // O mesmo bloqueio do servidor impede iniciar a API durante backup e migração.
    const db = new Database(testDatabasePath, { fileMustExist: true })
    try {
      db.pragma('foreign_keys = ON')
      validateWorkplaces(db, records)
      const beforeBackup = databaseFingerprint(db, true)
      const temporaryDirectory =
        mode === '--validate-copy'
          ? await mkdtemp(path.join(tmpdir(), 'local-trabalho-'))
          : null
      const backupPath = temporaryDirectory
        ? path.join(temporaryDirectory, 'copia.sqlite')
        : path.join(
            path.dirname(testDatabasePath),
            `dia-do-servidor-teste-backup-local-${Date.now()}.sqlite`,
          )
      if (
        existsSync(backupPath) ||
        lstatSync(testDatabasePath).isSymbolicLink() ||
        realpathSync(testDatabasePath) !== testDatabasePath ||
        statSync(testDatabasePath).nlink !== 1
      )
        throw new Error('Caminho de banco ou backup inseguro.')
      await db.backup(backupPath)
      const backup = new Database(backupPath, {
        readonly: true,
        fileMustExist: true,
      })
      try {
        validateWorkplaces(backup, records)
        if (digest(beforeBackup) !== digest(databaseFingerprint(backup, true)))
          throw new Error(
            'Backup diverge do banco original; operação cancelada.',
          )
      } finally {
        backup.close()
      }
      console.log(JSON.stringify({ backup: backupPath, validado: true }))
      if (mode === '--validate-copy') {
        const copy = new Database(backupPath)
        try {
          copy.pragma('foreign_keys = ON')
          console.log(
            JSON.stringify({ simulacao: migrateWorkplaces(copy, records) }),
          )
          console.log(
            JSON.stringify({
              reaplicacao: migrateWorkplaces(copy, records).atualizados,
            }),
          )
        } finally {
          copy.close()
          await rm(temporaryDirectory, { recursive: true, force: true })
        }
      } else {
        // Bloqueia escritores SQLite externos e revalida o estado usado no backup.
        const result = db
          .transaction(() => {
            if (digest(beforeBackup) !== digest(databaseFingerprint(db, true)))
              throw new Error('Banco alterado após backup; operação cancelada.')
            return migrateWorkplaces(db, records)
          })
          .immediate()
        console.log(JSON.stringify({ migracao: result }))
      }
    } finally {
      db.close()
    }
  } finally {
    release()
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
