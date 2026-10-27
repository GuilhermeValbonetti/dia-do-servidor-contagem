import dotenv from 'dotenv'
import Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
dotenv.config({ path: path.join(backendDirectory, '.env') })

const ignoredPdfLine = /\b(matr[ií]cula|nome|relat[oó]rio|servidores?|c[aâ]mara|prefeitura|p[aá]gina|total)\b/i

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function getCellText(cell) {
  const value = cell?.value

  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim()
  if (typeof value === 'object' && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join('').trim()
  }

  return ''
}

function findHeaderRow(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 30); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    let nameColumn
    let registrationColumn

    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = normalizeText(getCellText(cell))

      if (!nameColumn && /\bnome\b/.test(header)) nameColumn = columnNumber
      if (!registrationColumn && /matricula/.test(header)) registrationColumn = columnNumber
    })

    if (nameColumn && registrationColumn) {
      return { rowNumber, nameColumn, registrationColumn }
    }
  }

  return null
}

function addInvalid(invalid, source, reason) {
  invalid.push({ source, reason })
}

export async function readPrefeituraExcel(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const records = []
  const invalid = []
  let read = 0

  for (const worksheet of workbook.worksheets) {
    const header = findHeaderRow(worksheet)
    if (!header) continue

    for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber)
      const name = getCellText(row.getCell(header.nameColumn))
      const registration = getCellText(row.getCell(header.registrationColumn))
      if (!name && !registration) continue

      read += 1
      const source = `${worksheet.name}, linha ${rowNumber}`

      if (!name || !registration) {
        addInvalid(invalid, source, 'Nome ou matrícula ausente')
        continue
      }

      if (!/^\d+$/.test(registration)) {
        addInvalid(invalid, source, 'Matrícula deve conter somente números')
        continue
      }

      records.push({
        nome: name,
        matricula: registration,
        origem: 'prefeitura',
        source,
      })
    }
  }

  if (!read) {
    throw new Error('Não foi encontrado cabeçalho com as colunas de nome e matrícula no Excel.')
  }

  return { records, invalid, read }
}

function buildPdfLines(items) {
  const lines = []

  for (const item of items) {
    const text = item.str?.trim()
    if (!text) continue

    const y = Math.round(item.transform[5] * 2) / 2
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2)

    if (!line) {
      line = { y, items: [] }
      lines.push(line)
    }

    line.items.push({ x: item.transform[4], text })
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ').trim())
    .filter(Boolean)
}

function parsePdfLines(lines, pageNumber, records, invalid) {
  let pendingName = ''

  for (const line of lines) {
    if (ignoredPdfLine.test(line)) continue

    const numbers = [...line.matchAll(/(?:^|\s)(\d{2,})(?=\s|$)/g)]
    if (numbers.length !== 1) {
      if (!numbers.length && /[\p{L}]/u.test(line) && !/^\d+$/.test(line)) {
        pendingName = [pendingName, line].filter(Boolean).join(' ').trim()
      } else if (numbers.length > 1) {
        addInvalid(invalid, `página ${pageNumber}`, 'Linha com mais de um possível número de matrícula')
      }
      continue
    }

    const registration = numbers[0][1]
    const nameOnLine = line.replace(registration, ' ').replace(/[|:;,.-]/g, ' ').replace(/\s+/g, ' ').trim()
    const name = [pendingName, nameOnLine].filter(Boolean).join(' ').trim()
    pendingName = ''

    if (!name || /^\d+$/.test(name)) {
      addInvalid(invalid, `página ${pageNumber}`, 'Matrícula encontrada sem nome identificável')
      continue
    }

    records.push({
      nome: name,
      matricula: registration,
      origem: 'camara',
      source: `página ${pageNumber}`,
    })
  }

  if (pendingName) {
    addInvalid(invalid, `página ${pageNumber}`, 'Trecho de texto sem matrícula associado a um registro')
  }
}

export async function readCamaraPdf(filePath) {
  const loadingTask = getDocument({
    data: new Uint8Array(await readFile(filePath)),
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const records = []
  const invalid = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      parsePdfLines(buildPdfLines(content.items), pageNumber, records, invalid)
    }

    return { records, invalid, read: records.length + invalid.length, pages: pdf.numPages }
  } finally {
    await loadingTask.destroy()
  }
}

export function findDuplicates(records) {
  const seen = new Set()
  const duplicates = []

  for (const record of records) {
    const key = `${record.origem}\u0000${record.matricula}`
    if (seen.has(key)) {
      duplicates.push({ source: record.source, origem: record.origem })
    } else {
      seen.add(key)
    }
  }

  return duplicates
}

export function previewImport(db, sources, expected) {
  const records = sources.flatMap((source) => source.records)
  const invalid = sources.flatMap((source) => source.invalid)
  const duplicates = findDuplicates(records)
  const exists = db.prepare('SELECT 1 FROM servidores WHERE origem = ? AND matricula = ?')
  const existing = records.filter((record) => exists.get(record.origem, record.matricula))
  const totals = Object.fromEntries(
    sources.map((source) => [
      source.origem,
      {
        read: source.read,
        valid: source.records.length,
        invalid: source.invalid.length,
        pages: source.pages,
      },
    ]),
  )

  const differences = sources
    .filter((source) => source.read !== expected[source.origem])
    .map((source) => ({
      origem: source.origem,
      esperado: expected[source.origem],
      extraido: source.read,
    }))

  return {
    totals,
    duplicates,
    existing: existing.length,
    invalid,
    differences,
    records,
    blocked: invalid.length > 0 || duplicates.length > 0 || differences.length > 0,
  }
}

export function applyImport(db, records) {
  const insert = db.prepare(
    'INSERT INTO servidores (nome, matricula, origem) VALUES (?, ?, ?)',
  )
  const exists = db.prepare('SELECT 1 FROM servidores WHERE origem = ? AND matricula = ?')

  return db.transaction(() => {
    let inserted = 0
    let existing = 0

    for (const record of records) {
      if (exists.get(record.origem, record.matricula)) {
        existing += 1
        continue
      }

      insert.run(record.nome, record.matricula, record.origem)
      inserted += 1
    }

    return { inserted, existing }
  })()
}

function parseArguments(args) {
  const options = { mode: 'preview' }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--preview') options.mode = 'preview'
    else if (argument === '--import') options.mode = 'import'
    else if (['--prefeitura', '--camara', '--expected-prefeitura', '--expected-camara'].includes(argument)) {
      const value = args[index + 1]
      if (!value) throw new Error(`Informe um valor após ${argument}.`)
      options[argument.slice(2)] = value
      index += 1
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`)
    }
  }

  return options
}

function getExpectedCount(value, variableName) {
  const count = Number(value)
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Configure ${variableName} com um número inteiro igual ou maior que zero.`)
  }
  return count
}

function printReport(report) {
  console.log('Prévia da importação')
  for (const [origin, counts] of Object.entries(report.totals)) {
    const pages = counts.pages ? `; páginas ${counts.pages}` : ''
    console.log(`${origin}: lidos ${counts.read}; válidos ${counts.valid}; inválidos ${counts.invalid}${pages}`)
  }
  console.log(`Duplicados no mesmo arquivo/instituição: ${report.duplicates.length}`)
  console.log(`Já existentes no banco: ${report.existing}`)
  console.log(`Divergências de total: ${report.differences.length}`)

  for (const issue of report.invalid.slice(0, 10)) {
    console.log(`Inválido (${issue.source}): ${issue.reason}`)
  }
  for (const duplicate of report.duplicates.slice(0, 10)) {
    console.log(`Duplicado (${duplicate.source}, ${duplicate.origem})`)
  }
  for (const difference of report.differences) {
    console.log(`${difference.origem}: esperado ${difference.esperado}, extraído ${difference.extraido}`)
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const prefeituraPath = options.prefeitura || process.env.PREFEITURA_XLSX
  const camaraPath = options.camara || process.env.CAMARA_PDF

  if (!prefeituraPath || !camaraPath) {
    throw new Error('Informe os caminhos dos dois arquivos via backend/.env ou --prefeitura e --camara.')
  }

  const absolutePrefeituraPath = path.resolve(backendDirectory, prefeituraPath)
  const absoluteCamaraPath = path.resolve(backendDirectory, camaraPath)
  await Promise.all([access(absolutePrefeituraPath), access(absoluteCamaraPath)])

  const expected = {
    prefeitura: getExpectedCount(
      options['expected-prefeitura'] || process.env.EXPECTED_PREFEITURA_RECORDS || 13138,
      'EXPECTED_PREFEITURA_RECORDS',
    ),
    camara: getExpectedCount(
      options['expected-camara'] || process.env.EXPECTED_CAMARA_RECORDS || 167,
      'EXPECTED_CAMARA_RECORDS',
    ),
  }
  const [prefeitura, camara] = await Promise.all([
    readPrefeituraExcel(absolutePrefeituraPath),
    readCamaraPdf(absoluteCamaraPath),
  ])
  const sources = [
    { ...prefeitura, origem: 'prefeitura' },
    { ...camara, origem: 'camara' },
  ]

  const configuredDatabasePath = process.env.DB_PATH || './data/dia-do-servidor.sqlite'
  const databasePath = path.resolve(backendDirectory, configuredDatabasePath)
  const db = new Database(databasePath, { fileMustExist: true })
  db.pragma('foreign_keys = ON')

  try {
    const report = previewImport(db, sources, expected)
    printReport(report)

    if (options.mode === 'preview') {
      console.log('Modo prévia: nenhum registro foi gravado.')
      return
    }

    if (report.blocked) {
      throw new Error('Importação bloqueada: corrija os inválidos, duplicados e divergências antes de tentar novamente.')
    }

    const result = applyImport(db, report.records)
    console.log(`Importação concluída: ${result.inserted} inseridos; ${result.existing} já existentes.`)
  } finally {
    db.close()
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMainModule) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
