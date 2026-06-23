import type { Job, JobError, JobProgress, JobState, CardResult } from '@shortstory/shared';
import type { VideoMetadata } from '@shortstory/shared';
import { getRedis } from './redis.js';

const JOB_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function jobKey(id: string): string {
  return `job:${id}`;
}

export async function saveJob(job: Job): Promise<void> {
  await getRedis().set(jobKey(job.id), JSON.stringify(job), 'EX', JOB_TTL_SECONDS);
}

export async function getJob(id: string): Promise<Job | null> {
  const raw = await getRedis().get(jobKey(id));
  if (!raw) return null;
  return JSON.parse(raw) as Job;
}

export interface JobUpdate {
  state?: JobState;
  progress?: JobProgress;
  metadata?: VideoMetadata;
  result?: CardResult;
  error?: JobError;
}

export async function updateJob(id: string, update: JobUpdate): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  // Build the updated Job explicitly to satisfy exactOptionalPropertyTypes.
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

  await saveJob(merged as unknown as Job);
}
