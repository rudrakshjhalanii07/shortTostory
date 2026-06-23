import { unlink } from 'node:fs/promises';
import { Worker, type Job as BullJob } from 'bullmq';
import { bullMQConnection } from '../lib/redis.js';
import { updateJob } from '../lib/jobStore.js';
import { logger } from '../lib/logger.js';
import { extractVideoId } from '../lib/youtubeUrl.js';
import { fetchVideoMetadata } from '../lib/youtubeClient.js';
import { downloadThumbnail } from '../lib/thumbnail.js';
import { renderCard } from '../lib/cardRenderer.js';
import { uploadCard } from '../lib/s3Uploader.js';
import { AppError } from '../types/errors.js';
import type { CardJobData } from '../queues/cardQueue.js';
import type { JobErrorCode } from '@shortstory/shared';

async function cleanupFile(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await unlink(path);
  } catch {
    // ENOENT or already deleted — ignore silently
  }
}

async function processCard(bullJob: BullJob<CardJobData>): Promise<void> {
  const { jobId, sourceUrl } = bullJob.data;
  logger.info({ jobId, sourceUrl }, 'card job processing');

  let thumbnailPath: string | undefined;
  let cardPath: string | undefined;
  let uploadDone = false;

  try {
    // 1. Extract video ID — throws INVALID_URL on null.
    const videoId = extractVideoId(sourceUrl);
    if (!videoId) throw AppError.invalidUrl();

    // 2. Fetch metadata from YouTube Data API v3.
    const metadata = await fetchVideoMetadata(videoId);
    await updateJob(jobId, {
      metadata,
      progress: { stage: 'downloading_thumbnail', percent: 33 },
    });

    // 3. Download thumbnail to temp file.
    thumbnailPath = await downloadThumbnail(metadata.thumbnailUrl, jobId);
    await updateJob(jobId, {
      progress: { stage: 'rendering_card', percent: 66 },
    });

    // 4. Render attribution card with ffmpeg.
    cardPath = await renderCard({ jobId, thumbnailPath, metadata });
    await updateJob(jobId, {
      progress: { stage: 'uploading_result', percent: 90 },
    });

    // Upload card to S3, persist result, delete local temp file.
    const upload = await uploadCard(cardPath, jobId);
    uploadDone = true;
    await updateJob(jobId, {
      state: 'completed',
      result: {
        downloadUrl: upload.downloadUrl,
        contentType: 'image/jpeg',
        expiresAt: upload.expiresAt,
        attributionLinkUrl: metadata.shortUrl,
        width: 1080,
        height: 1920,
      },
    });
  } catch (err) {
    // Map AppError → JobErrorCode; collapse anything else to INTERNAL.
    let code: JobErrorCode = 'INTERNAL';
    let message = 'An unexpected error occurred.';

    if (err instanceof AppError && err.isOperational) {
      code = err.code as JobErrorCode;
      message = err.message;
    }

    await updateJob(jobId, { state: 'failed', error: { code, message } });
    // Re-throw so BullMQ records the failure and triggers the 'failed' event.
    throw err;
  } finally {
    await cleanupFile(thumbnailPath);
    // uploadCard deletes the card file on success; clean up here only on failure.
    if (!uploadDone && cardPath) {
      await cleanupFile(cardPath);
    }
  }
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
    logger.error({ jobId: job?.data.jobId, err }, 'card job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'card worker error');
  });

  return worker;
}
