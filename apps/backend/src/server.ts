import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { closeRedis } from './lib/redis.js';
import { createJobStore } from './lib/jobStore/index.js';
import { createUploader } from './lib/uploader/index.js';
import { createJobQueue } from './queues/index.js';
import { createCardWorker } from './workers/cardWorker.js';
import { createApp } from './app.js';
import type { Worker } from 'bullmq';

const jobStore = createJobStore();
const uploader = createUploader();
const jobQueue = createJobQueue(jobStore, uploader);

// Worker is only started in bullmq mode; in inline mode the queue drives
// processCard directly inside the API process.
let worker: Worker | undefined;
if (config.QUEUE_MODE === 'bullmq') {
  worker = createCardWorker(jobStore, uploader);
}

const app = createApp({ jobStore, jobQueue });

const server = app.listen(config.PORT, () => {
  const storageMode = config.S3_BUCKET ? 's3' : 'local';
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, queue: config.QUEUE_MODE, storage: storageMode },
    'server started',
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutdown signal received — draining connections');

  server.close(async () => {
    await jobQueue.close();
    if (worker) await worker.close();
    if (config.QUEUE_MODE === 'bullmq') await closeRedis();
    logger.info('all connections closed, exiting cleanly');
    process.exit(0);
  });

  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);

  forceExit.unref();
}

process.on('SIGTERM', () => { shutdown('SIGTERM'); });
process.on('SIGINT', () => { shutdown('SIGINT'); });

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception — exiting');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled promise rejection — exiting');
  process.exit(1);
});
