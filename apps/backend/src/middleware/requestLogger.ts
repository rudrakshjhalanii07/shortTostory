import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.url === '/health') {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const statusCode = res.statusCode;

    const logData = {
      requestId: String(req.id),
      method: req.method,
      url: req.url,
      statusCode,
      durationMs: Math.round(durationMs),
    };

    if (statusCode >= 500) {
      logger.error(logData, 'request failed');
    } else if (statusCode >= 400) {
      logger.warn(logData, 'request rejected');
    } else {
      logger.info(logData, 'request completed');
    }
  });

  next();
}
