import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

  // Required in production; optional in development (defaults to redis://localhost:6379).
  REDIS_URL: z.string().url().optional(),

  // Phase 4
  YOUTUBE_API_KEY: z.string().min(1).optional(),

  // Phase 5/6
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('[config] Invalid environment — server cannot start:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.REDIS_URL) {
  console.error('[config] REDIS_URL is required in production');
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.YOUTUBE_API_KEY) {
  console.error('[config] YOUTUBE_API_KEY is required in production');
  process.exit(1);
}

const s3Required: Array<keyof typeof parsed.data> = [
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];
if (parsed.data.NODE_ENV === 'production') {
  for (const key of s3Required) {
    if (!parsed.data[key]) {
      console.error(`[config] ${key} is required in production`);
      process.exit(1);
    }
  }
}

const result = parsed;

export const config = result.data;
export type Config = typeof config;
