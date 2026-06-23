import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

const REDIS_URL = config.REDIS_URL ?? 'redis://localhost:6379';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, {
      retryStrategy: (times: number) => Math.min(times * 50, 2_000),
      lazyConnect: false,
    });
    _redis.on('error', (err: Error) => logger.error({ err }, 'redis error'));
    _redis.on('connect', () => logger.info('redis connected'));
    _redis.on('reconnecting', () => logger.warn('redis reconnecting'));
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

/**
 * Connection options passed to BullMQ. BullMQ creates its own ioredis
 * connections internally with the settings required for blocking commands.
 */
export const bullMQConnection = { url: REDIS_URL } as const;
