import { unlink } from 'node:fs/promises';
import { logger } from '../lib/logger.js';
import { extractVideoId } from '../lib/youtubeUrl.js';
import { fetchVideoMetadata } from '../lib/youtubeClient.js';
import { downloadThumbnail } from '../lib/thumbnail.js';
import { renderCard } from '../lib/cardRenderer.js';
import { AppError } from '../types/errors.js';
import type { IJobStore } from '../lib/jobStore/index.js';
import type { IUploader } from '../lib/uploader/index.js';
import type { JobErrorCode } from '@shortstory/shared';

async function cleanupFile(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await unlink(path);
  } catch {
    // ENOENT or already deleted — ignore silently
  }
}

export async function processCard(
  jobId: string,
  sourceUrl: string,
  store: IJobStore,
  uploader: IUploader,
): Promise<void> {
  logger.info({ jobId, sourceUrl }, 'card job processing');

  let thumbnailPath: string | undefined;
  let cardPath: string | undefined;
  let uploadDone = false;

  try {
    const videoId = extractVideoId(sourceUrl);
    if (!videoId) throw AppError.invalidUrl();

    const metadata = await fetchVideoMetadata(videoId);
    await store.update(jobId, {
      metadata,
      progress: { stage: 'downloading_thumbnail', percent: 33 },
    });

    thumbnailPath = await downloadThumbnail(metadata.thumbnailUrl, jobId);
    await store.update(jobId, {
      progress: { stage: 'rendering_card', percent: 66 },
    });

    cardPath = await renderCard({ jobId, thumbnailPath, metadata });
    await store.update(jobId, {
      progress: { stage: 'uploading_result', percent: 90 },
    });

    const upload = await uploader.upload(cardPath, jobId);
    uploadDone = true;
    await store.update(jobId, {
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
    let code: JobErrorCode = 'INTERNAL';
    let message = 'An unexpected error occurred.';

    if (err instanceof AppError && err.isOperational) {
      code = err.code as JobErrorCode;
      message = err.message;
    }

    await store.update(jobId, { state: 'failed', error: { code, message } });
    throw err;
  } finally {
    await cleanupFile(thumbnailPath);
    // uploader.upload() deletes cardPath on success; only clean up here on failure.
    if (!uploadDone && cardPath) {
      await cleanupFile(cardPath);
    }
  }
}
