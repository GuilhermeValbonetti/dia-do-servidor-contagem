import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import {
  applyImport,
  findDuplicates,
  previewImport,
  readCamaraPdf,
  readPrefeituraExcel,
} from '../src/import-servers.js'

const temporaryDirectories = []

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dia-servidor-import-'))
  temporaryDirectories.push(directory)
  return directory
}

function createDatabase() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE servidores (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      matricula TEXT NOT NULL,
      origem TEXT NOT NULL,
      UNIQUE (origem, matricula)
    );
  `)
  return db
}

async function createTextPdf(filePath, rows) {
  const stream = [
    'BT',
    '/F1 12 Tf',
    ...rows.flatMap((row, index) => [`1 0 0 1 50 ${700 - index * 14} Tm`, `(${row}) Tj`]),
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let document = '%PDF-1.4\n'
  const offsets = [0]

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(document))
    document += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(document)
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  await writeFile(filePath, document)
}

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })))
})

test('reads Excel by header names and preserves text registrations and accents', async () => {
  const directory = await createTemporaryDirectory()
  const filePath = path.join(directory, 'prefeitura.xlsx')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Servidores')
  sheet.addRow(['Outras informações', 'Matrícula', 'Nome completo', 'Situação'])
  sheet.addRow(['Férias', '00127', 'João da Conceição', 'Ativo'])
  sheet.addRow(['Folha diferente', 128, 'João da Conceição', 'Ativo'])
  sheet.addRow(['', '', 'Nome sem matrícula', ''])
  sheet.addRow(['', 'ABC', 'Matrícula inválida', ''])
  await workbook.xlsx.writeFile(filePath)

  const result = await readPrefeituraExcel(filePath)
  assert.equal(result.read, 4)
  assert.equal(result.records.length, 2)
  assert.equal(result.records[0].matricula, '00127')
  assert.equal(result.records[0].nome, 'João da Conceição')
  assert.equal(result.records[0].origem, 'prefeitura')
  assert.equal(result.invalid.length, 2)
  assert.match(result.invalid[0].source, /linha 4/)
  assert.match(result.invalid[1].reason, /somente números/)
})

test('extracts PDF text, combines wrapped names, and preserves leading zeroes', async () => {
  const directory = await createTemporaryDirectory()
  const filePath = path.join(directory, 'camara.pdf')
  await createTextPdf(filePath, ['Joao da', 'Conceicao 0817'])

  const result = await readCamaraPdf(filePath)
  assert.equal(result.pages, 1)
  assert.equal(result.read, 1)
  assert.equal(result.invalid.length, 0, JSON.stringify(result))
  assert.equal(result.records[0].nome, 'Joao da Conceicao')
  assert.equal(result.records[0].matricula, '0817')
  assert.equal(result.records[0].origem, 'camara')
})

test('detects duplicates only within the same institution and registration', () => {
  const records = [
    { nome: 'Pessoa A', matricula: '0123', origem: 'prefeitura', source: 'linha 2' },
    { nome: 'Pessoa B', matricula: '0124', origem: 'prefeitura', source: 'linha 3' },
    { nome: 'Pessoa C', matricula: '0123', origem: 'camara', source: 'página 1' },
    { nome: 'Pessoa D', matricula: '0123', origem: 'prefeitura', source: 'linha 4' },
  ]

  assert.deepEqual(findDuplicates(records), [{ source: 'linha 4', origem: 'prefeitura' }])
})

test('blocks a preview when records are invalid, duplicated, or totals differ', () => {
  const db = createDatabase()
  const report = previewImport(
    db,
    [
      {
        origem: 'prefeitura',
        read: 2,
        records: [
          { nome: 'Pessoa', matricula: '123', origem: 'prefeitura', source: 'linha 2' },
          { nome: 'Outra pessoa', matricula: '123', origem: 'prefeitura', source: 'linha 3' },
        ],
        invalid: [{ source: 'linha 4', reason: 'Matrícula ausente' }],
        expected: 2,
      },
      {
        origem: 'camara',
        read: 0,
        records: [],
        invalid: [],
        expected: 1,
      },
    ],
    { prefeitura: 2, camara: 1 },
  )

  assert.equal(report.blocked, true)
  assert.equal(report.duplicates.length, 1)
  assert.equal(report.invalid.length, 1)
  assert.equal(report.differences.length, 1)
  db.close()
})

test('imports atomically, is idempotent, and persists after reopening', async () => {
  const directory = await createTemporaryDirectory()
  const databasePath = path.join(directory, 'test.sqlite')
  const records = [
    { nome: 'Pessoa 1', matricula: '001', origem: 'prefeitura' },
    { nome: 'Pessoa 2', matricula: '001', origem: 'camara' },
  ]
  let db = new Database(databasePath)
  db.exec(`
    CREATE TABLE servidores (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      matricula TEXT NOT NULL,
      origem TEXT NOT NULL,
      UNIQUE (origem, matricula)
    );
  `)

  assert.deepEqual(applyImport(db, records), { inserted: 2, existing: 0 })
  assert.deepEqual(applyImport(db, records), { inserted: 0, existing: 2 })
  db.close()

  db = new Database(databasePath)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM servidores').get().count, 2)
  assert.equal(db.prepare('SELECT matricula FROM servidores WHERE origem = ?').get('prefeitura').matricula, '001')
  db.close()
})

test('rolls back all inserted rows when a constraint fails', () => {
  const db = createDatabase()
  db.exec(`
    CREATE TRIGGER reject_second_source
    BEFORE INSERT ON servidores
    WHEN NEW.matricula = 'FAIL'
    BEGIN
      SELECT RAISE(ABORT, 'forced failure');
    END;
  `)

  assert.throws(
    () =>
      applyImport(db, [
        { nome: 'Pessoa 1', matricula: '001', origem: 'prefeitura' },
        { nome: 'Pessoa 2', matricula: 'FAIL', origem: 'prefeitura' },
      ]),
    /forced failure/,
  )
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM servidores').get().count, 0)
  db.close()
})
