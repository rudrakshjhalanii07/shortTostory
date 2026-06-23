import type { Job, JobError, JobProgress, JobState, CardResult, VideoMetadata } from '@shortstory/shared';

export interface JobUpdate {
  state?: JobState;
  progress?: JobProgress;
  metadata?: VideoMetadata;
  result?: CardResult;
  error?: JobError;
}

export interface IJobStore {
  save(job: Job): Promise<void>;
  get(id: string): Promise<Job | null>;
  update(id: string, update: JobUpdate): Promise<void>;
}
