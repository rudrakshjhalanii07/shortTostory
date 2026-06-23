/**
 * Creator metadata sourced from the official YouTube Data API v3.
 *
 * COMPLIANCE NOTE (Model B): none of these fields are scraped. They come from
 * the public YouTube Data API, which licenses metadata + thumbnail usage for
 * exactly this kind of attribution/citation use. We never download or
 * redistribute the source video itself.
 */

/** A validated YouTube video identifier (the 11-char id, not a full URL). */
export type YouTubeVideoId = string;

/**
 * The full attribution record for a Short. Required fields map 1:1 to the
 * product's "Credits Requirements"; optional fields are rendered only when the
 * API returns them.
 */
export interface VideoMetadata {
  /** Canonical 11-character YouTube video id. */
  readonly videoId: YouTubeVideoId;
  /** Canonical watch URL we link back to from the Story. */
  readonly shortUrl: string;

  // --- Required credits ---
  /** Human-readable channel name, e.g. "MrBeast". */
  readonly channelTitle: string;
  /** Creator handle including the leading "@", e.g. "@MrBeast". */
  readonly creatorHandle: string;
  /** Video title as published. */
  readonly title: string;
  /** Canonical channel URL we attribute to. */
  readonly channelUrl: string;
  /** Upload date in ISO-8601 (UTC), e.g. "2025-06-01T12:00:00Z". */
  readonly publishedAt: string;

  // --- Optional credits (rendered only if present) ---
  /** View count at fetch time, if the API exposes it. */
  readonly viewCount?: number;
  /** Detected/declared music track, if available. */
  readonly musicTrack?: string;

  // --- Rendering inputs ---
  /** Highest-resolution thumbnail URL returned by the API. */
  readonly thumbnailUrl: string;
  /** License as reported by the API; gates future full-video models. */
  readonly license: YouTubeLicense;
  /** Duration in seconds; used to enforce the 90s policy limit. */
  readonly durationSeconds: number;
}

export type YouTubeLicense = 'youtube' | 'creativeCommon';

/** Hard product limit: Shorts longer than this are rejected. */
export const MAX_VIDEO_DURATION_SECONDS = 90;
