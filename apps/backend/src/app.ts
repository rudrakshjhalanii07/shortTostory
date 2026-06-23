import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { API_BASE_PATH, type ApiErrorResponse } from '@shortstory/shared';
import { config } from './config/index.js';
import { getRedis } from './lib/redis.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());

  const allowedOrigins: string | string[] =
    config.CORS_ORIGINS === '*'
      ? '*'
      : config.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins }));

  // Required so express-rate-limit reads the real client IP behind a proxy.
  app.set('trust proxy', 1);

  // Sets req.id — must run before rate limiter and logger.
  app.use(requestId);

  app.use(requestLogger);

  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      // ioredis exposes call() at runtime but omits it from its public type declarations.
      store: new RedisStore({
        sendCommand: (...args: string[]) =>
          (getRedis() as unknown as { call(...a: string[]): Promise<RedisReply> }).call(...args),
      }),
      handler: (req, res) => {
        const body: ApiErrorResponse = {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down.',
            requestId: String(req.id),
          },
        };
        res.status(429).json(body);
      },
    }),
  );

  // Limit body size to block trivial payload-inflation attacks.
  app.use(express.json({ limit: '16kb' }));

  // Routes — health is mounted at both / and /api/v1 for flexibility.
  app.use(healthRouter);
  app.use(API_BASE_PATH, healthRouter);

  // 404 — must come after all real routes.
  app.use((req, res) => {
    const body: ApiErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found.`,
        requestId: String(req.id),
      },
    };
    res.status(404).json(body);
  });

  app.use(errorHandler);

  return app;
}

export const app = createApp();
