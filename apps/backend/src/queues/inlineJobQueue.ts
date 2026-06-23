import { logger } from '../lib/logger.js';
import { processCard } from '../pipeline/processCard.js';
import type { IJobStore } from '../lib/jobStore/index.js';
import type { IUploader } from '../lib/uploader/index.js';
import type { IJobQueue } from './types.js';

export class InlineJobQueue implements IJobQueue {
  constructor(
    private readonly store: IJobStore,
    private readonly uploader: IUploader,
  ) {}

  async add(jobId: string, sourceUrl: string): Promise<void> {
    // Fire-and-forget: the HTTP response returns immediately with jobId.
    // The client polls GET /jobs/:id; processCard updates the store as it progresses.
    void processCard(jobId, sourceUrl, this.store, this.uploader).catch((err: unknown) => {
      logger.error({ jobId, err }, 'inline job failed');
    });
  }

  async close(): Promise<void> {}
}
