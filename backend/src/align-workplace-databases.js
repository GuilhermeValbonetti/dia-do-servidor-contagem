import Database from 'better-sqlite3'
import { chmodSync, existsSync, lstatSync, realpathSync, statSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  acquireTestLock,
  officialDatabasePath,
  testDatabasePath,
  testBasePath,
  getDatabaseSummary,
} from './database-environment.js'
import {
  databaseFingerprint,
  migrateWorkplaces,
  readWorkplaces,
  validateWorkplaces,
} from './migrate-workplaces.js'

// Operação manual explícita; nunca é executada na inicialização da API.
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply')
    throw new Error(
      'Use --apply para alinhar os três caminhos fixos com backups e simulação prévia.',
    )
  const targets = [officialDatabasePath, testDatabasePath, testBasePath]
  const identities = new Set()
  for (const target of targets) {
    const stat = statSync(target)
    const identity = `${stat.dev}:${stat.ino}`
    if (
      lstatSync(target).isSymbolicLink() ||
      stat.nlink !== 1 ||
      realpathSync(target) !== target ||
      identities.has(identity)
    )
      throw new Error(`Caminho inseguro ou compartilhado: ${target}`)
    identities.add(identity)
  }
  const records = await readWorkplaces(
    fileURLToPath(
      new URL('../../arquivos funcionarios/Servidores_Ativos_Corrigido.xlsx', import.meta.url),
    ),
  )
  const release = acquireTestLock()
  let temporary
  const stamp = Date.now()
  const reports = []
  try {
    temporary = await mkdtemp(path.join(tmpdir(), 'alinhamento-locais-'))
    // Todos os backups são concluídos e validados antes da primeira alteração persistente.
    for (const target of targets) {
      const source = new Database(target, {
        readonly: true,
        fileMustExist: true,
      })
      const backupPath = target.replace(/\.sqlite$/, `-backup-alinhamento-${stamp}.sqlite`)
      if (existsSync(backupPath)) throw new Error('Backup já existe.')
      try {
        validateWorkplaces(source, records)
        const before = databaseFingerprint(source, true)
        await source.backup(backupPath)
        const backup = new Database(backupPath, {
          readonly: true,
          fileMustExist: true,
        })
        try {
          validateWorkplaces(backup, records)
          if (JSON.stringify(before) !== JSON.stringify(databaseFingerprint(backup, true)))
            throw new Error('Backup divergente.')
          const copyPath = path.join(temporary, path.basename(target))
          await backup.backup(copyPath)
          const copy = new Database(copyPath, { fileMustExist: true })
          try {
            copy.pragma('foreign_keys = ON')
            const simulation = migrateWorkplaces(copy, records)
            if (migrateWorkplaces(copy, records).atualizados !== 0)
              throw new Error('Migração não idempotente.')
            reports.push({
              target,
              backup: backupPath,
              backupValidado: true,
              before,
              simulation,
            })
          } finally {
            copy.close()
          }
        } finally {
          backup.close()
        }
      } finally {
        source.close()
      }
    }
    console.log(JSON.stringify({ backupsESimulacoes: reports }))
    for (const report of reports) {
      const originalMode = statSync(report.target).mode
      const protectedFile = (originalMode & 0o222) === 0
      let db
      try {
        if (protectedFile) chmodSync(report.target, originalMode | 0o200)
        db = new Database(report.target, { fileMustExist: true })
        db.pragma('foreign_keys = ON')
        report.migration = db
          .transaction(() => {
            if (JSON.stringify(report.before) !== JSON.stringify(databaseFingerprint(db, true)))
              throw new Error('Banco alterado após o backup; operação cancelada.')
            return migrateWorkplaces(db, records)
          })
          .immediate()
        report.after = getDatabaseSummary(db)
        report.foreignKeyErrors = db.pragma('foreign_key_check').length
      } finally {
        db?.close()
        if (protectedFile) chmodSync(report.target, originalMode)
      }
      report.readOnlyRestored = !protectedFile || (statSync(report.target).mode & 0o222) === 0
      console.log(JSON.stringify(report))
    }
    const reportPath = path.join(path.dirname(testDatabasePath), `alinhamento-locais-${stamp}.json`)
    await writeFile(reportPath, JSON.stringify(reports, null, 2))
    console.log(JSON.stringify({ reportPath }))
  } finally {
    // Apenas o diretório temporário criado nesta execução é removido.
    try {
      if (temporary) await rm(temporary, { recursive: true, force: true })
    } finally {
      release()
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
