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
import { createJobsRouter } from './routes/jobs.js';
import { UPLOADS_DIR } from './lib/uploader/index.js';
import type { IJobStore } from './lib/jobStore/index.js';
import type { IJobQueue } from './queues/index.js';

export interface AppDeps {
  jobStore: IJobStore;
  jobQueue: IJobQueue;
}

export function createApp({ jobStore, jobQueue }: AppDeps): express.Application {
  const app = express();

  app.use(helmet());

  const allowedOrigins: string | string[] =
    config.CORS_ORIGINS === '*'
      ? '*'
      : config.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins }));

  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(requestLogger);

  // In bullmq mode Redis is available, so use it as the rate-limit store to
  // keep counters consistent across potential restarts/replicas.
  // In inline mode fall back to the default in-memory store.
  const redisRateLimitStore =
    config.QUEUE_MODE === 'bullmq'
      ? new RedisStore({
          sendCommand: (...args: string[]) =>
            (getRedis() as unknown as { call(...a: string[]): Promise<RedisReply> }).call(...args),
        })
      : undefined;

  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      ...(redisRateLimitStore ? { store: redisRateLimitStore } : {}),
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

  app.use(express.json({ limit: '16kb' }));

  // Serve rendered cards directly when running without S3 (local/dev mode).
  // Cross-Origin-Resource-Policy must be 'cross-origin' so browsers on other
  // origins (e.g. the Vercel PWA) can load the card image in an <img> tag.
  // Helmet defaults to 'same-origin' which would block cross-origin image loads.
  if (!config.S3_BUCKET) {
    app.use('/uploads', (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    }, express.static(UPLOADS_DIR));
  }

  app.use(healthRouter);
  app.use(API_BASE_PATH, healthRouter);
  app.use(API_BASE_PATH, createJobsRouter(jobStore, jobQueue));

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
