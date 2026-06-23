import type { VideoMetadata } from './metadata.js';

/**
 * Lifecycle of a single attribution-card render job. The mobile app polls this
 * state machine; the backend worker advances it.
 *
 *   queued ──▶ processing ──▶ completed
 *                 │
 *                 └────────▶ failed
 */
export type JobState = 'queued' | 'processing' | 'completed' | 'failed';

/** Coarse-grained step within `processing`, surfaced to the UI for progress. */
export type JobStage =
  | 'fetching_metadata'
  | 'downloading_thumbnail'
  | 'rendering_card'
  | 'uploading_result';

export interface JobProgress {
  readonly stage: JobStage;
  /** 0–100, best-effort. */
  readonly percent: number;
}

/** The deliverable the mobile app downloads and hands to Instagram. */
export interface CardResult {
  /** Temporary, signed download URL for the rendered Story-format card. */
  readonly downloadUrl: string;
  /** MIME type of the rendered asset. */
  readonly contentType: 'video/mp4' | 'image/jpeg';
  /** Wall-clock expiry of `downloadUrl` (ISO-8601). */
  readonly expiresAt: string;
  /** Original Short URL, attached to the Story as a tappable link sticker. */
  readonly attributionLinkUrl: string;
  /** Output pixel dimensions (always 9:16). */
  readonly width: number;
  readonly height: number;
}

/**
 * Canonical job record persisted in Redis. This is the source of truth the
 * status endpoint serializes from.
 */
export interface Job {
  readonly id: string;
  readonly state: JobState;
  /** Echo of the submitted Short URL. */
  readonly sourceUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  readonly progress?: JobProgress;
  /** Populated once metadata has been fetched. */
  readonly metadata?: VideoMetadata;
  /** Populated on `completed`. */
  readonly result?: CardResult;
  /** Populated on `failed`. */
  readonly error?: JobError;
}

export interface JobError {
  readonly code: JobErrorCode;
  /** Safe, user-facing message. Never leak internals here. */
  readonly message: string;
}

export type JobErrorCode =
  | 'INVALID_URL'
  | 'VIDEO_NOT_FOUND'
  | 'VIDEO_TOO_LONG'
  | 'METADATA_UNAVAILABLE'
  | 'RENDER_FAILED'
  | 'UPLOAD_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL';
