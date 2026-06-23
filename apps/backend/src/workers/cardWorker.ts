import { Worker, type Job as BullJob } from 'bullmq';
import { bullMQConnection } from '../lib/redis.js';
import { updateJob } from '../lib/jobStore.js';
import { logger } from '../lib/logger.js';
import type { CardJobData } from '../queues/cardQueue.js';

// Phase 4 fills in metadata fetch; Phase 5 fills in render; Phase 6 fills in upload.
async function processCard(bullJob: BullJob<CardJobData>): Promise<void> {
  const { jobId, sourceUrl } = bullJob.data;
  logger.info({ jobId, sourceUrl }, 'card job processing [stub]');
  // TODO(phase-4): fetch YouTube metadata
  // TODO(phase-5): render attribution card with ffmpeg
  // TODO(phase-6): upload card to S3 and set result on job
}

export function createCardWorker(): Worker<CardJobData> {
  const worker = new Worker<CardJobData>('card', processCard, {
    connection: bullMQConnection,
    concurrency: 2,
  });

  worker.on('active', (job) => {
    void updateJob(job.data.jobId, {
      state: 'processing',
      progress: { stage: 'fetching_metadata', percent: 0 },
    });
    logger.info({ jobId: job.data.jobId }, 'card job active');
  });

  worker.on('completed', (job) => {
    void updateJob(job.data.jobId, { state: 'completed' });
    logger.info({ jobId: job.data.jobId }, 'card job completed');
  });

  worker.on('failed', (job, err) => {
    if (job) {
      void updateJob(job.data.jobId, {
        state: 'failed',
        error: { code: 'INTERNAL', message: 'Job processing failed.' },
      });
    }
    logger.error({ jobId: job?.data.jobId, err }, 'card job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'card worker error');
  });

  return worker;
}
