import { Router } from 'express';
import { config } from '../config/index.js';
import { getRedis } from '../lib/redis.js';

const router = Router();

router.get('/health', async (_req, res) => {
  let redisStatus: 'ok' | 'error' | 'disabled' = 'disabled';

  if (config.QUEUE_MODE === 'bullmq') {
    try {
      const pong = await getRedis().ping();
      redisStatus = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      redisStatus = 'error';
    }
  }

  const healthy = redisStatus === 'ok' || redisStatus === 'disabled';

  res.json({
    status: healthy ? 'ok' : 'degraded',
    version: process.env['npm_package_version'] ?? 'unknown',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    queue: config.QUEUE_MODE,
    storage: config.S3_BUCKET ? 's3' : 'local',
    redis: redisStatus,
  });
});

export { router as healthRouter };
