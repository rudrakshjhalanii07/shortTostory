export type { IJobQueue } from './types.js';
export { BullMQJobQueue } from './bullmqJobQueue.js';
export { InlineJobQueue } from './inlineJobQueue.js';

import { config } from '../config/index.js';
import type { IJobStore } from '../lib/jobStore/index.js';
import type { IUploader } from '../lib/uploader/index.js';
import type { IJobQueue } from './types.js';
import { BullMQJobQueue } from './bullmqJobQueue.js';
import { InlineJobQueue } from './inlineJobQueue.js';

export function createJobQueue(store: IJobStore, uploader: IUploader): IJobQueue {
  return config.QUEUE_MODE === 'bullmq'
    ? new BullMQJobQueue()
    : new InlineJobQueue(store, uploader);
}
