import { Queue } from 'bullmq';
import { bullMQConnection } from '../lib/redis.js';

export interface CardJobData {
  /** Matches the Job.id stored in Redis — used to look up and update the record. */
  jobId: string;
  sourceUrl: string;
}

let _cardQueue: Queue<CardJobData> | null = null;

export function getCardQueue(): Queue<CardJobData> {
  if (!_cardQueue) {
    _cardQueue = new Queue<CardJobData>('card', {
      connection: bullMQConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _cardQueue;
}
