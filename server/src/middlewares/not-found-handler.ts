import type { RequestHandler } from 'express';
import { HttpError } from './error-handler.js';

const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'Rota não encontrada.'));
};

export default notFoundHandler;
