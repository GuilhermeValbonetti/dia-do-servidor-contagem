import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function getStatusCode(error: unknown): number {
  if (error instanceof HttpError) {
    return error.statusCode;
  }

  if (typeof error === 'object' && error !== null) {
    const status =
      'status' in error
        ? error.status
        : 'statusCode' in error
          ? error.statusCode
          : undefined;

    if (typeof status === 'number' && status >= 400 && status <= 599) {
      return status;
    }
  }

  return 500;
}

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Ocorreu um erro inesperado.';
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    _next(error);
    return;
  }

  const statusCode = getStatusCode(error);
  const isProduction = process.env.NODE_ENV === 'production';
  const message =
    isProduction && statusCode >= 500
      ? 'Ocorreu um erro interno.'
      : getMessage(error);

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(isProduction || !(error instanceof Error) ? {} : { stack: error.stack }),
  });
};

export default errorHandler;