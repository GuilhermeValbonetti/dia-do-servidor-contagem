import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getDatabaseUrl } from './database-config.js';
const adapter = new PrismaBetterSqlite3({
    url: getDatabaseUrl(),
});
export const prisma = new PrismaClient({ adapter });
