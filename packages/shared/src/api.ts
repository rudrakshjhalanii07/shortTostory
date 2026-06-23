import type { Job, CardResult, JobError, JobProgress, JobState } from './job.js';

/**
 * HTTP request/response DTOs — the wire contract the mobile app and Express
 * backend share. Keeping these here means a breaking API change fails to
 * compile on BOTH sides, not silently at runtime.
 */

/** POST /api/v1/jobs */
export interface CreateJobRequest {
  /** Raw YouTube Short URL as received from the share extension. */
  readonly url: string;
}

export interface CreateJobResponse {
  readonly jobId: string;
  readonly state: JobState;
  /** Suggested client poll interval in milliseconds. */
  readonly pollIntervalMs: number;
}

/** GET /api/v1/jobs/:id */
export interface JobStatusResponse {
  readonly jobId: string;
  readonly state: JobState;
  readonly progress?: JobProgress;
  readonly result?: CardResult;
  readonly error?: JobError;
}

/** Uniform error envelope for non-2xx responses across the whole API. */
export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    /** Correlation id for matching client reports to server logs. */
    readonly requestId: string;
  };
}

/** Maps an internal Job record to its public status representation. */
export function toJobStatusResponse(job: Job): JobStatusResponse {
  return {
    jobId: job.id,
    state: job.state,
    ...(job.progress ? { progress: job.progress } : {}),
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

export const API_BASE_PATH = '/api/v1';
