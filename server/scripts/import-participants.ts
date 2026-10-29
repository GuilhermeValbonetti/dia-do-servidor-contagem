import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { PDFParse } from 'pdf-parse';
import readXlsxFile from 'read-excel-file/node';
import { prisma } from '../src/database/prisma.js';

type PublicAgency = 'PREFEITURA' | 'CAMARA';

interface Options {
  filePath: string;
  agency: PublicAgency;
  apply: boolean;
}

interface CsvRecord {
  fields: string[];
  line: number;
}

interface ParticipantData {
  name: string;
  registrationNumber: string | null;
  cpf: string | null;
  publicAgency: PublicAgency;
  department: string | null;
}

interface ParticipantImportRow extends ParticipantData {
  line: number;
}

interface PlannedParticipant {
  id: number;
  original: ParticipantData | null;
  data: ParticipantData;
}

interface ImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  errors: string[];
}

const helpText = `Importa participantes de um arquivo CSV, PDF ou XLSX.

Uso:
  npm run import:participants -- --file <arquivo.csv|arquivo.pdf|arquivo.xlsx> --agency <orgao> [--apply | --dry-run]

Órgãos:
  PREFEITURA
  CAMARA

Colunas aceitas: nome (ou servidor), matricula, cpf e departamento
(ou DESCR LOCAL DE TRABALHO).
É necessário informar nome e ao menos uma coluna de identificação (matricula ou cpf).
O separador vírgula ou ponto e vírgula é detectado automaticamente.
O PDF deve conter texto selecionável com as colunas SERVIDOR e MATRICULA.
O XLSX deve ter os cabeçalhos na primeira linha; é lida a primeira planilha.
Se a coluna MATRICULA contiver exatamente 11 dígitos, o valor será importado como CPF.

Sem --apply, o comando apenas valida e mostra uma prévia. Faça backup do banco
antes de aplicar uma importação. CPF e matrícula devem ser preservados como texto
no CSV ou XLSX para não perder zeros à esquerda.`;

function parseArguments(args: string[]): Options | 'help' {
  let filePath: string | undefined;
  let agency: PublicAgency | undefined;
  let apply = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      return 'help';
    }

    if (argument === '--file' || argument === '--agency') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Informe um valor para ${argument}.`);
      }

      if (argument === '--file') {
        filePath = value;
      } else if (value === 'PREFEITURA' || value === 'CAMARA') {
        agency = value;
      } else {
        throw new Error('--agency deve ser PREFEITURA ou CAMARA.');
      }

      index += 1;
      continue;
    }

    if (argument === '--apply') {
      apply = true;
      continue;
    }

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    throw new Error(`Argumento desconhecido: ${argument}`);
  }

  if (apply && dryRun) {
    throw new Error('Use --apply ou --dry-run, não ambos.');
  }

  if (!filePath) {
    throw new Error('Informe o arquivo com --file.');
  }

  if (!agency) {
    throw new Error('Informe o órgão com --agency.');
  }

  return { filePath, agency, apply };
}

function countDelimiters(header: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;

  for (let index = 0; index < header.length; index += 1) {
    const character = header[index];

    if (character === '"' && header[index + 1] === '"' && inQuotes) {
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(content: string): string {
  const header = content.split(/\r\n|\n|\r/, 1)[0] ?? '';
  return countDelimiters(header, ';') > countDelimiters(header, ',')
    ? ';'
    : ',';
}

function parseCsv(content: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;
  let recordHasContent = false;

  const finishField = () => {
    fields.push(field);
    field = '';
    afterQuote = false;
  };

  const finishRecord = () => {
    finishField();
    if (fields.some((value) => value.trim() !== '')) {
      records.push({ fields, line: recordLine });
    }
    fields = [];
    recordHasContent = false;
    recordLine = line + 1;
  };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (inQuotes) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
        afterQuote = true;
      } else {
        field += character;
        if (character === '\n') {
          line += 1;
        }
      }
      recordHasContent = true;
      continue;
    }

    if (
      afterQuote &&
      character !== delimiter &&
      character !== '\r' &&
      character !== '\n' &&
      !/\s/.test(character)
    ) {
      throw new Error(`CSV inválido na linha ${line}: conteúdo após aspas.`);
    }

    if (character === '"' && field.length === 0 && !afterQuote) {
      inQuotes = true;
      recordHasContent = true;
    } else if (character === delimiter) {
      finishField();
      recordHasContent = true;
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && content[index + 1] === '\n') {
        index += 1;
      }
      finishRecord();
      line += 1;
      recordLine = line;
    } else {
      if (character === '"' && !afterQuote) {
        throw new Error(
          `CSV inválido na linha ${line}: aspas fora de um campo.`,
        );
      }
      if (!afterQuote) {
        field += character;
      }
      if (!/\s/.test(character)) {
        recordHasContent = true;
      }
    }
  }

  if (inQuotes) {
    throw new Error(
      `CSV inválido na linha ${recordLine}: campo entre aspas não finalizado.`,
    );
  }

  if (recordHasContent || fields.length > 0 || field.length > 0) {
    finishRecord();
  }

  return records;
}

function parsePdfRecords(pageTexts: string[]): {
  records: CsvRecord[];
  declaredTotal: number | undefined;
} {
  const records: CsvRecord[] = [{ fields: ['servidor', 'matricula'], line: 1 }];
  let sourceLine = 1;
  let declaredTotal: number | undefined;

  for (const [pageIndex, pageText] of pageTexts.entries()) {
    const lines = pageText.split(/\r\n|\n|\r/).map((line) => line.trim());
    const headerIndex = lines.findIndex((line) => {
      const normalized = normalizeHeader(line);
      return (
        normalized.startsWith('servidor') && normalized.includes('matricu')
      );
    });

    if (headerIndex === -1) {
      throw new Error(
        `Não foi encontrado o cabeçalho SERVIDOR/MATRICULA na página ${pageIndex + 1}.`,
      );
    }

    let pendingName = '';

    for (const line of lines.slice(headerIndex + 1)) {
      sourceLine += 1;
      if (!line) {
        continue;
      }

      const totalMatch = line.match(/^total\s+de\s+registros?\s*:\s*(\d+)/i);
      if (totalMatch) {
        declaredTotal = Number(totalMatch[1]);
        continue;
      }

      if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) {
        continue;
      }

      if (normalizeHeader(line).startsWith('servidor')) {
        continue;
      }

      const rowMatch = line.match(/^(.+?)\s+(\d+)$/);
      if (rowMatch) {
        const name = `${pendingName} ${rowMatch[1]}`.trim();
        records.push({ fields: [name, rowMatch[2]], line: sourceLine });
        pendingName = '';
        continue;
      }

      if (/^\d+$/.test(line)) {
        if (pendingName) {
          records.push({ fields: [pendingName, line], line: sourceLine });
          pendingName = '';
        } else {
          records.push({ fields: ['', line], line: sourceLine });
        }
        continue;
      }

      pendingName = `${pendingName} ${line}`.trim();
    }

    if (pendingName) {
      records.push({ fields: [pendingName, ''], line: sourceLine });
    }
  }

  if (records.length === 1) {
    throw new Error(
      'Nenhum registro foi extraído do PDF. Se ele for digitalizado, converta-o para texto ou CSV antes de importar.',
    );
  }

  return { records, declaredTotal };
}

async function readPdfRecords(filePath: string): Promise<{
  records: CsvRecord[];
  declaredTotal: number | undefined;
}> {
  const parser = new PDFParse({ data: await readFile(filePath) });

  try {
    const result = await parser.getText();
    if (result.pages.length === 0) {
      throw new Error('O PDF não contém páginas legíveis.');
    }

    return parsePdfRecords(result.pages.map((page) => page.text));
  } finally {
    await parser.destroy();
  }
}

async function readXlsxRecords(filePath: string): Promise<CsvRecord[]> {
  const worksheets = await readXlsxFile(filePath);
  const worksheet = worksheets[0];
  if (!worksheet || worksheet.data.length === 0) {
    throw new Error('O arquivo XLSX não contém planilhas.');
  }

  const columnCount = worksheet.data.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  const records = worksheet.data
    .map((row, index) => ({
      fields: Array.from({ length: columnCount }, (_, columnIndex) =>
        row[columnIndex] == null ? '' : String(row[columnIndex]),
      ),
      line: index + 1,
    }))
    .filter((record) => record.fields.some((field) => field.trim() !== ''));

  if (records.length === 0) {
    throw new Error('A primeira planilha do XLSX está vazia.');
  }

  return records;
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function getColumnIndexes(headers: string[]): {
  name: number;
  registrationNumber: number | undefined;
  cpf: number | undefined;
  department: number | undefined;
} {
  const indexes: {
    name: number | undefined;
    registrationNumber: number | undefined;
    cpf: number | undefined;
    department: number | undefined;
  } = {
    name: undefined,
    registrationNumber: undefined,
    cpf: undefined,
    department: undefined,
  };

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const column =
      normalized === 'nome' || normalized === 'servidor'
        ? 'name'
        : normalized === 'matricula'
          ? 'registrationNumber'
          : normalized === 'cpf'
            ? 'cpf'
            : normalized === 'descrlocaldetrabalho' ||
                normalized === 'departamento'
              ? 'department'
              : undefined;

    if (column && indexes[column] !== undefined) {
      throw new Error(`Cabeçalho duplicado para a coluna ${column}.`);
    }
    if (column) {
      indexes[column] = index;
    }
  });

  if (indexes.name === undefined) {
    throw new Error('O arquivo precisa conter a coluna nome ou servidor.');
  }

  if (indexes.registrationNumber === undefined && indexes.cpf === undefined) {
    throw new Error(
      'O arquivo precisa conter matricula, cpf ou ambas as colunas.',
    );
  }

  return {
    name: indexes.name,
    registrationNumber: indexes.registrationNumber,
    cpf: indexes.cpf,
    department: indexes.department,
  };
}

function normalizeCpf(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  if (!/^[\d.\-\s]+$/.test(trimmed)) {
    throw new Error('CPF contém caracteres inválidos.');
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 11) {
    throw new Error('CPF deve conter 11 dígitos.');
  }
  return digits;
}

function inferCpfFromRegistration(value: string | null): string | null {
  if (!value || !/^[\d.\-\s]+$/.test(value)) {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

function parseParticipants(
  records: CsvRecord[],
  agency: PublicAgency,
): { participants: ParticipantImportRow[]; errors: string[] } {
  if (records.length === 0) {
    throw new Error('O arquivo está vazio.');
  }

  const headers = records[0].fields.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '') : header,
  );
  const columns = getColumnIndexes(headers);
  const participants: ParticipantImportRow[] = [];
  const errors: string[] = [];

  for (const record of records.slice(1)) {
    try {
      if (record.fields.length !== headers.length) {
        throw new Error('quantidade de colunas diferente do cabeçalho.');
      }

      const name = record.fields[columns.name].trim();
      const importedRegistrationNumber =
        columns.registrationNumber === undefined
          ? null
          : record.fields[columns.registrationNumber].trim() || null;
      const importedCpf = normalizeCpf(
        columns.cpf === undefined ? undefined : record.fields[columns.cpf],
      );
      const department =
        columns.department === undefined
          ? null
          : record.fields[columns.department].trim() || null;
      const inferredCpf = inferCpfFromRegistration(importedRegistrationNumber);

      if (importedCpf && inferredCpf && importedCpf !== inferredCpf) {
        throw new Error(
          'CPF informado difere do CPF encontrado na coluna matrícula.',
        );
      }

      const registrationNumber = inferredCpf
        ? null
        : importedRegistrationNumber;
      const cpf = importedCpf ?? inferredCpf;

      if (!name) {
        throw new Error('nome obrigatório.');
      }
      if (!registrationNumber && !cpf) {
        throw new Error('informe matrícula ou CPF.');
      }

      participants.push({
        name,
        registrationNumber,
        cpf,
        publicAgency: agency,
        department,
        line: record.line,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'registro inválido.';
      errors.push(`Linha ${record.line}: ${reason}`);
    }
  }

  return { participants, errors };
}

function registrationKey(agency: PublicAgency, value: string): string {
  return `${agency}\u0000${value}`;
}

function sameData(left: ParticipantData, right: ParticipantData): boolean {
  return (
    left.name === right.name &&
    left.registrationNumber === right.registrationNumber &&
    left.cpf === right.cpf &&
    left.publicAgency === right.publicAgency &&
    left.department === right.department
  );
}

async function importParticipants(
  rows: ParticipantImportRow[],
  initialErrors: string[],
  apply: boolean,
): Promise<ImportSummary> {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.participant.findMany({
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        cpf: true,
        publicAgency: true,
        department: true,
      },
    });

    const planned = new Map<number, PlannedParticipant>();
    const cpfIndex = new Map<string, number>();
    const registrationIndex = new Map<string, number>();
    let nextTemporaryId = -1;
    const errors = [...initialErrors];
    const rowErrors: string[] = [];

    for (const participant of existing) {
      const data: ParticipantData = {
        name: participant.name,
        registrationNumber: participant.registrationNumber,
        cpf: participant.cpf,
        publicAgency: participant.publicAgency,
        department: participant.department,
      };
      planned.set(participant.id, { id: participant.id, original: data, data });
      if (data.cpf) {
        cpfIndex.set(data.cpf, participant.id);
      }
      if (data.registrationNumber) {
        registrationIndex.set(
          registrationKey(data.publicAgency, data.registrationNumber),
          participant.id,
        );
      }
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const cpfMatch = row.cpf ? cpfIndex.get(row.cpf) : undefined;
      const registrationMatch = row.registrationNumber
        ? registrationIndex.get(
            registrationKey(row.publicAgency, row.registrationNumber),
          )
        : undefined;

      if (
        cpfMatch !== undefined &&
        registrationMatch !== undefined &&
        cpfMatch !== registrationMatch
      ) {
        rowErrors.push(
          `Linha ${row.line}: CPF e matrícula identificam participantes diferentes.`,
        );
        continue;
      }

      const matchId = cpfMatch ?? registrationMatch;
      if (matchId !== undefined) {
        const match = planned.get(matchId);
        if (!match) {
          throw new Error('Estado interno inconsistente durante a importação.');
        }
        if (match.data.publicAgency !== row.publicAgency) {
          rowErrors.push(`Linha ${row.line}: CPF já associado a outro órgão.`);
          continue;
        }
      }

      const targetId = matchId ?? nextTemporaryId--;
      const current = matchId === undefined ? undefined : planned.get(matchId);
      const nextData: ParticipantData = {
        name: row.name,
        registrationNumber:
          row.registrationNumber ?? current?.data.registrationNumber ?? null,
        cpf: row.cpf ?? current?.data.cpf ?? null,
        publicAgency: row.publicAgency,
        department: row.department ?? current?.data.department ?? null,
      };

      const conflictingCpf =
        nextData.cpf && cpfIndex.get(nextData.cpf) !== undefined
          ? cpfIndex.get(nextData.cpf)
          : undefined;
      const nextRegistrationKey = nextData.registrationNumber
        ? registrationKey(nextData.publicAgency, nextData.registrationNumber)
        : undefined;
      const conflictingRegistration =
        nextRegistrationKey === undefined
          ? undefined
          : registrationIndex.get(nextRegistrationKey);

      if (
        (conflictingCpf !== undefined && conflictingCpf !== targetId) ||
        (conflictingRegistration !== undefined &&
          conflictingRegistration !== targetId)
      ) {
        rowErrors.push(
          `Linha ${row.line}: CPF ou matrícula já pertence a outro participante.`,
        );
        continue;
      }

      if (current?.data.cpf && cpfIndex.get(current.data.cpf) === targetId) {
        cpfIndex.delete(current.data.cpf);
      }
      if (
        current?.data.registrationNumber &&
        registrationIndex.get(
          registrationKey(
            current.data.publicAgency,
            current.data.registrationNumber,
          ),
        ) === targetId
      ) {
        registrationIndex.delete(
          registrationKey(
            current.data.publicAgency,
            current.data.registrationNumber,
          ),
        );
      }

      const plannedParticipant: PlannedParticipant = current ?? {
        id: targetId,
        original: null,
        data: nextData,
      };
      plannedParticipant.data = nextData;
      planned.set(targetId, plannedParticipant);
      if (nextData.cpf) {
        cpfIndex.set(nextData.cpf, targetId);
      }
      if (nextData.registrationNumber) {
        registrationIndex.set(
          registrationKey(nextData.publicAgency, nextData.registrationNumber),
          targetId,
        );
      }
    }

    const changes = [...planned.values()].filter(
      (participant) =>
        participant.original === null ||
        !sameData(participant.original, participant.data),
    );
    const created = changes.filter(
      (participant) => participant.original === null,
    );
    const updated = changes.filter(
      (participant) => participant.original !== null,
    );
    errors.push(...rowErrors);
    const unchanged =
      rows.length - rowErrors.length - created.length - updated.length;

    if (apply && errors.length === 0) {
      for (const participant of created) {
        await transaction.participant.create({ data: participant.data });
      }
      for (const participant of updated) {
        await transaction.participant.update({
          where: { id: participant.id },
          data: participant.data,
        });
      }
    }

    return {
      created: created.length,
      updated: updated.length,
      unchanged: Math.max(0, unchanged),
      rejected: errors.length,
      errors,
    };
  });
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options === 'help') {
    console.log(helpText);
    return;
  }

  const filePath = resolve(options.filePath);
  const extension = extname(filePath).toLowerCase();
  let records: CsvRecord[];
  let declaredTotal: number | undefined;

  if (extension === '.csv') {
    const content = await readFile(filePath, 'utf8');
    records = parseCsv(content, detectDelimiter(content));
  } else if (extension === '.pdf') {
    const pdf = await readPdfRecords(filePath);
    records = pdf.records;
    declaredTotal = pdf.declaredTotal;
  } else if (extension === '.xlsx') {
    records = await readXlsxRecords(filePath);
  } else {
    throw new Error(
      'Formato não suportado. Use um arquivo .csv, .pdf ou .xlsx.',
    );
  }

  const { participants, errors } = parseParticipants(records, options.agency);
  if (
    declaredTotal !== undefined &&
    participants.length + errors.length !== declaredTotal
  ) {
    throw new Error(
      `A extração encontrou ${participants.length + errors.length} registros, mas o PDF informa ${declaredTotal}. Nenhum dado foi gravado.`,
    );
  }

  const summary = await importParticipants(participants, errors, options.apply);

  console.log(
    options.apply
      ? 'Resultado da importação:'
      : 'Prévia (nenhum dado foi gravado):',
  );
  console.log(`Novos participantes: ${summary.created}`);
  console.log(`Participantes atualizados: ${summary.updated}`);
  console.log(`Sem alterações: ${summary.unchanged}`);
  console.log(`Registros rejeitados: ${summary.rejected}`);
  console.log(
    `CPFs identificados: ${participants.filter((participant) => participant.cpf).length}`,
  );
  console.log(
    `Matrículas identificadas: ${participants.filter((participant) => participant.registrationNumber).length}`,
  );
  for (const error of summary.errors) {
    console.error(`- ${error}`);
  }

  if (summary.rejected > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Falha inesperada na importação.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
