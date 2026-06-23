import { cardQueue } from './cardQueue.js';
import type { IJobQueue } from './types.js';

export class BullMQJobQueue implements IJobQueue {
  async add(jobId: string, sourceUrl: string): Promise<void> {
    await cardQueue.add('card', { jobId, sourceUrl });
  }

  async close(): Promise<void> {
    await cardQueue.close();
  }
}
