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

  // Controls job processing mode.
  // 'inline'  — process jobs synchronously in the API process; no Redis/BullMQ required.
  // 'bullmq'  — enqueue jobs into BullMQ; requires REDIS_URL and a running worker.
  // Default: 'bullmq' when REDIS_URL is set, 'inline' otherwise.
  QUEUE_MODE: z.enum(['inline', 'bullmq']).optional(),

  // Phase 4
  YOUTUBE_API_KEY: z.string().min(1).optional(),

  // Phase 5/6
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Public base URL used by LocalUploader to build download URLs.
  // Required in production when S3 is not configured.
  PUBLIC_URL: z.string().url().optional(),
});

// Treat empty-string env vars the same as absent — dotenv writes "" for blank lines.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== ''),
);

const parsed = schema.safeParse(env);

if (!parsed.success) {
  console.error('[config] Invalid environment — server cannot start:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

// Derive effective queue mode from explicit setting or presence of REDIS_URL.
const effectiveQueueMode: 'inline' | 'bullmq' =
  parsed.data.QUEUE_MODE ?? (parsed.data.REDIS_URL ? 'bullmq' : 'inline');

if (effectiveQueueMode === 'bullmq' && !parsed.data.REDIS_URL) {
  console.error('[config] QUEUE_MODE=bullmq requires REDIS_URL');
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && effectiveQueueMode !== 'bullmq') {
  console.error('[config] NODE_ENV=production requires QUEUE_MODE=bullmq (and REDIS_URL)');
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
  const hasS3 = s3Required.every((k) => parsed.data[k]);
  const hasLocal = !!parsed.data.PUBLIC_URL;
  if (!hasS3 && !hasLocal) {
    console.error('[config] Production requires either full S3 config or PUBLIC_URL (for local storage)');
    process.exit(1);
  }
  if (hasS3) {
    for (const key of s3Required) {
      if (!parsed.data[key]) {
        console.error(`[config] ${key} is required when using S3 in production`);
        process.exit(1);
      }
    }
  }
}

export const config = { ...parsed.data, QUEUE_MODE: effectiveQueueMode };
export type Config = typeof config;
