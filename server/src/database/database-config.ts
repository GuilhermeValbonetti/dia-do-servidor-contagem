import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function getDatabaseUrl(): string {
  const dataDirectory = process.env.APP_DATA_DIR;
  if (dataDirectory) {
    const absoluteDirectory = resolve(dataDirectory);
    mkdirSync(absoluteDirectory, { recursive: true });

    const databasePath = resolve(absoluteDirectory, 'sorteio.db')
      .replaceAll('\\', '/');
    return `file:${databasePath}`;
  }

  return process.env.DATABASE_URL ?? 'file:./data/sorteio.db';
}
