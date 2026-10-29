import 'dotenv/config';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import errorHandler from './middlewares/error-handler.js';
import notFoundHandler from './middlewares/not-found-handler.js';
import participantsRoutes from './routes/participants.routes.js';
import prizesRoutes from './routes/prizes.routes.js';
import drawsRoutes from './routes/draws.routes.js';
import projectionRoutes from './routes/projection.routes.js';
import { publishUpdates, subscribeToUpdates } from './middlewares/live-updates.js';

const app = express();

// Middlewares
app.use(express.json());
app.use(morgan('dev'));

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
      : false,
  }),
);

// Rota para verificar se a API está funcionando
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mensagem: 'API do Sorteio dos Servidores funcionando!',
  });
});

// Rotas da API
app.get('/api/events', subscribeToUpdates);
app.use('/api', publishUpdates);
app.use('/api/participants', participantsRoutes);
app.use('/api/prizes', prizesRoutes);
app.use('/api/draws', drawsRoutes);
app.use('/api/projection', projectionRoutes);

const frontendDirectory = resolve(
  process.env.FRONTEND_DIST_DIR ?? resolve(process.cwd(), '../frontend/dist'),
);

if (existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(resolve(frontendDirectory, 'index.html'));
  });
} else if (process.env.NODE_ENV === 'production') {
  throw new Error(`Arquivos do frontend não encontrados: ${frontendDirectory}`);
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
