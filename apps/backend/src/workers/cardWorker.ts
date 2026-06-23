import { Worker, type Job as BullJob } from 'bullmq';
import { bullMQConnection } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { processCard } from '../pipeline/processCard.js';
import type { IJobStore } from '../lib/jobStore/index.js';
import type { IUploader } from '../lib/uploader/index.js';
import type { CardJobData } from '../queues/cardQueue.js';

export function createCardWorker(store: IJobStore, uploader: IUploader): Worker<CardJobData> {
  const worker = new Worker<CardJobData>(
    'card',
    (bullJob: BullJob<CardJobData>) =>
      processCard(bullJob.data.jobId, bullJob.data.sourceUrl, store, uploader),
    { connection: bullMQConnection, concurrency: 2 },
  );

  worker.on('active', (job) => {
    store
      .update(job.data.jobId, {
        state: 'processing',
        progress: { stage: 'fetching_metadata', percent: 0 },
      })
      .catch(() => {});
    logger.info({ jobId: job.data.jobId }, 'card job active');
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.data.jobId }, 'card job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.data.jobId, err }, 'card job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'card worker error');
  });

  return worker;
}
