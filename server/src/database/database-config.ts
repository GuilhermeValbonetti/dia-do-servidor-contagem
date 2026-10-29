import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function getDatabaseUrl(): string {
  const dataDirectory = process.env.APP_DATA_DIR;
  if (dataDirectory) {
    const absoluteDirectory = resolve(dataDirectory);
    mkdirSync(absoluteDirectory, { recursive: true });

    const databasePath = resolve(absoluteDirectory, 'sorteio.db')
      .replaceAll('\\', '/');
    return `file:${databasePath}`;
  }

  const databaseUrl = process.env.DATABASE_URL ?? 'file:./data/sorteio.db';
  if (databaseUrl.startsWith('file:') && databaseUrl !== 'file::memory:') {
    const databasePath = resolve(databaseUrl.slice(5));
    mkdirSync(dirname(databasePath), { recursive: true });
    return `file:${databasePath.replaceAll('\\', '/')}`;
  }
  return databaseUrl;
}
