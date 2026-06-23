import type { Job } from '@shortstory/shared';
import { getRedis } from '../redis.js';
import type { IJobStore, JobUpdate } from './types.js';

const JOB_TTL_SECONDS = 24 * 60 * 60;

function jobKey(id: string): string {
  return `job:${id}`;
}

function merge(job: Job, update: JobUpdate): Job {
  const merged: Record<string, unknown> = {
    id: job.id,
    state: update.state ?? job.state,
    sourceUrl: job.sourceUrl,
    createdAt: job.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const progress = update.progress ?? job.progress;
  const metadata = update.metadata ?? job.metadata;
  const result = update.result ?? job.result;
  const error = update.error ?? job.error;

  if (progress !== undefined) merged['progress'] = progress;
  if (metadata !== undefined) merged['metadata'] = metadata;
  if (result !== undefined) merged['result'] = result;
  if (error !== undefined) merged['error'] = error;

  return merged as unknown as Job;
}

export class RedisJobStore implements IJobStore {
  async save(job: Job): Promise<void> {
    await getRedis().set(jobKey(job.id), JSON.stringify(job), 'EX', JOB_TTL_SECONDS);
  }

  async get(id: string): Promise<Job | null> {
    const raw = await getRedis().get(jobKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as Job;
  }

  async update(id: string, update: JobUpdate): Promise<void> {
    const job = await this.get(id);
    if (!job) return;
    await this.save(merge(job, update));
  }
}
