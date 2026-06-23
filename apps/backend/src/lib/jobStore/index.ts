export type { IJobStore, JobUpdate } from './types.js';
export { RedisJobStore } from './redisJobStore.js';
export { MemoryJobStore } from './memoryJobStore.js';

import { config } from '../../config/index.js';
import type { IJobStore } from './types.js';
import { RedisJobStore } from './redisJobStore.js';
import { MemoryJobStore } from './memoryJobStore.js';

export function createJobStore(): IJobStore {
  return config.QUEUE_MODE === 'bullmq' ? new RedisJobStore() : new MemoryJobStore();
}
