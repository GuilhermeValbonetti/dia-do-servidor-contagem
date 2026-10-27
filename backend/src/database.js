import Database from 'better-sqlite3'
import dotenv from 'dotenv'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))

dotenv.config({ path: path.join(backendDirectory, '.env') })

const configuredDatabasePath = process.env.DB_PATH || './data/dia-do-servidor.sqlite'
const databasePath = path.resolve(backendDirectory, configuredDatabasePath)

mkdirSync(path.dirname(databasePath), { recursive: true })

const db = new Database(databasePath)

db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS servidores (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
    matricula TEXT NOT NULL CHECK (length(trim(matricula)) > 0),
    origem TEXT NOT NULL CHECK (origem IN ('prefeitura', 'camara')),
    cpf TEXT CHECK (cpf IS NULL OR length(trim(cpf)) > 0),
    UNIQUE (origem, matricula)
  );

  CREATE TABLE IF NOT EXISTS credenciamentos (
    servidor_id INTEGER PRIMARY KEY REFERENCES servidores(id) ON DELETE RESTRICT,
    confirmado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS premios (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL CHECK (length(trim(nome)) > 0)
  );

  CREATE TABLE IF NOT EXISTS sorteios (
    id INTEGER PRIMARY KEY,
    numero INTEGER NOT NULL UNIQUE CHECK (numero > 0),
    servidor_id INTEGER NOT NULL UNIQUE REFERENCES servidores(id) ON DELETE RESTRICT,
    premio_id INTEGER UNIQUE REFERENCES premios(id) ON DELETE RESTRICT,
    sorteado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_credenciamentos_confirmado_em
    ON credenciamentos(confirmado_em);
  CREATE INDEX IF NOT EXISTS idx_sorteios_sorteado_em
    ON sorteios(sorteado_em);

  CREATE TRIGGER IF NOT EXISTS sorteios_requer_presenca
  BEFORE INSERT ON sorteios
  WHEN NOT EXISTS (
    SELECT 1 FROM credenciamentos WHERE servidor_id = NEW.servidor_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'Servidor precisa ter presença confirmada para ser sorteado');
  END;

  CREATE TRIGGER IF NOT EXISTS sorteios_numero_sequencial
  BEFORE INSERT ON sorteios
  WHEN NEW.numero != COALESCE((SELECT MAX(numero) + 1 FROM sorteios), 1)
  BEGIN
    SELECT RAISE(ABORT, 'Número do sorteio deve ser sequencial');
  END;

  CREATE TRIGGER IF NOT EXISTS credenciamentos_vencedor_nao_pode_ser_desfeito
  BEFORE DELETE ON credenciamentos
  WHEN EXISTS (
    SELECT 1 FROM sorteios WHERE servidor_id = OLD.servidor_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'Presença de servidor contemplado não pode ser desfeita');
  END;

  CREATE TRIGGER IF NOT EXISTS credenciamentos_vencedor_nao_pode_ser_alterado
  BEFORE UPDATE ON credenciamentos
  WHEN EXISTS (
    SELECT 1 FROM sorteios WHERE servidor_id = OLD.servidor_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'Credenciamento de servidor contemplado não pode ser alterado');
  END;

  CREATE TRIGGER IF NOT EXISTS sorteios_nao_podem_ser_alterados
  BEFORE UPDATE ON sorteios
  BEGIN
    SELECT RAISE(ABORT, 'Resultado de sorteio não pode ser alterado');
  END;

  CREATE TRIGGER IF NOT EXISTS sorteios_nao_podem_ser_excluidos
  BEFORE DELETE ON sorteios
  BEGIN
    SELECT RAISE(ABORT, 'Resultado de sorteio não pode ser excluído');
  END;

  CREATE TRIGGER IF NOT EXISTS premios_utilizados_nao_podem_ser_alterados
  BEFORE UPDATE ON premios
  WHEN EXISTS (
    SELECT 1 FROM sorteios WHERE premio_id = OLD.id
  )
  BEGIN
    SELECT RAISE(ABORT, 'Prêmio utilizado não pode ser alterado');
  END;
`)

export default db
