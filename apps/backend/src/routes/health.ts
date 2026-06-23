import { Router } from 'express';
import { getRedis } from '../lib/redis.js';

const router = Router();

router.get('/health', async (_req, res) => {
  let redisStatus: 'ok' | 'error' = 'error';
  try {
    const pong = await getRedis().ping();
    if (pong === 'PONG') redisStatus = 'ok';
  } catch {
    // redisStatus stays 'error'
  }

  res.json({
    status: redisStatus === 'ok' ? 'ok' : 'degraded',
    version: process.env['npm_package_version'] ?? 'unknown',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    redis: redisStatus,
  });
});

export { router as healthRouter };
