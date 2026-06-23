import type { Job } from '@shortstory/shared';
import type { IJobStore, JobUpdate } from './types.js';

const JOB_TTL_MS = 24 * 60 * 60 * 1000;

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

export class MemoryJobStore implements IJobStore {
  private readonly map = new Map<string, Job>();

  async save(job: Job): Promise<void> {
    this.map.set(job.id, job);
    // Self-expire after 24 h — unref so the timer doesn't block process exit.
    setTimeout(() => this.map.delete(job.id), JOB_TTL_MS).unref();
  }

  async get(id: string): Promise<Job | null> {
    return this.map.get(id) ?? null;
  }

  async update(id: string, update: JobUpdate): Promise<void> {
    const job = await this.get(id);
    if (!job) return;
    await this.save(merge(job, update));
  }
}
