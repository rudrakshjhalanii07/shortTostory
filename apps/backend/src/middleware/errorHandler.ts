import type { ErrorRequestHandler } from 'express';
import type { ApiErrorResponse } from '@shortstory/shared';
import { AppError } from '../types/errors.js';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);

  if (err instanceof AppError && err.isOperational) {
    logger.warn({ requestId, code: err.code, statusCode: err.statusCode }, err.message);

    const body: ApiErrorResponse = {
      error: { code: err.code, message: err.message, requestId },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error({ requestId, err }, 'unhandled error');

  const body: ApiErrorResponse = {
    error: {
      code: 'INTERNAL',
      message: 'An unexpected error occurred.',
      requestId,
    },
  };
  res.status(500).json(body);
};
