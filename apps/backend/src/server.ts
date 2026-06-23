import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { closeRedis } from './lib/redis.js';
import { createCardWorker } from './workers/cardWorker.js';

const worker = createCardWorker();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'server started');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutdown signal received — draining connections');

  server.close(async () => {
    await worker.close();
    await closeRedis();
    logger.info('all connections closed, exiting cleanly');
    process.exit(0);
  });

  // Force-exit if graceful drain stalls — prevents stuck containers.
  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);

  // Don't hold the event loop open for the timeout itself.
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
