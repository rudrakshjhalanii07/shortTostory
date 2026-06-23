import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { VideoMetadata } from '@shortstory/shared';
import { AppError } from '../types/errors.js';

const execFileAsync = promisify(execFile);

const ASSETS_DIR = fileURLToPath(new URL('../../assets/fonts', import.meta.url));
const FONT_REGULAR = join(ASSETS_DIR, 'Inter-Regular.ttf');
const FONT_BOLD = join(ASSETS_DIR, 'Inter-Bold.ttf');

// Card dimensions
const W = 1080;
const H = 1920;
const BG = '0x0F0F0F';

// Thumbnail placement: 96 px margin each side, starting 160 px from top
const THUMB_W = W - 192; // 888 px
const THUMB_H = 498;      // even number — ffmpeg may round 499 up to 500 for 4:3 sources
const THUMB_Y = 160;

// Text block starts below the thumbnail.
const TEXT_X = 72;
const TEXT_WRAP_W = W - 144; // characters are ~18 px each at size 32

// ---------------------------------------------------------------------------
// ffmpeg text-filter helpers
// ---------------------------------------------------------------------------

/** Escape special characters for the ffmpeg drawtext filter value. */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,');
}

/**
 * Truncate text so it fits within maxChars, appending "…" if needed.
 * ffmpeg drawtext has no auto-wrap, so we keep one line per field.
 */
function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1) + '…';
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderCardInput {
  jobId: string;
  thumbnailPath: string;
  metadata: VideoMetadata;
}

/**
 * Render a 1080×1920 JPEG attribution card using ffmpeg.
 * Returns the path to the output file. Caller is responsible for cleanup.
 */
export async function renderCard({ jobId, thumbnailPath, metadata }: RenderCardInput): Promise<string> {
  const outputPath = join(tmpdir(), `shortstory-card-${jobId}.jpg`);

  // Text values — truncated to fit single-line layout
  const channelLine = truncate(metadata.channelTitle, 38);
  const handleLine = truncate(metadata.creatorHandle, 42);
  const titleLine = truncate(metadata.title, 44);

  const textStartY = THUMB_Y + THUMB_H + 60;

  const y0 = textStartY;        // channel title
  const y1 = y0 + 52;           // creator handle
  const y2 = y1 + 52;           // divider line (drawn via drawbox)
  const y3 = y2 + 28;           // video title
  const y4 = y3 + 52;           // view count / CTA

  // Build filter_complex
  const filters: string[] = [
    // Scale thumbnail to fit within THUMB_W×THUMB_H (handles any aspect ratio),
    // then pad to exactly THUMB_W×THUMB_H so the overlay geometry is predictable.
    // THUMB_H is even so ffmpeg never rounds the scaled height above the pad target.
    `[1:v]scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,` +
      `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:color=${BG}[thumb]`,

    // Overlay thumbnail centered horizontally, THUMB_Y from top
    `[0:v][thumb]overlay=x=(W-w)/2:y=${THUMB_Y}[bg0]`,

    // Separator line between thumbnail and text
    `[bg0]drawbox=x=${TEXT_X}:y=${y2}:w=${TEXT_WRAP_W}:h=2:color=0x333333:t=fill[bg1]`,

    // Channel title (bold, white, 32 px)
    `[bg1]drawtext=fontfile='${FONT_BOLD}':text='${esc(channelLine)}':` +
      `x=${TEXT_X}:y=${y0}:fontsize=32:fontcolor=white[bg2]`,

    // Creator handle (regular, grey, 26 px)
    `[bg2]drawtext=fontfile='${FONT_REGULAR}':text='${esc(handleLine)}':` +
      `x=${TEXT_X}:y=${y1}:fontsize=26:fontcolor=0xAAAAAA[bg3]`,

    // Video title (regular, white, 30 px)
    `[bg3]drawtext=fontfile='${FONT_REGULAR}':text='${esc(titleLine)}':` +
      `x=${TEXT_X}:y=${y3}:fontsize=30:fontcolor=white[bg4]`,
  ];

  // View count line (optional) — add if present, then CTA
  let lastOut = 'bg4';

  if (metadata.viewCount !== undefined) {
    const viewsLine = formatViews(metadata.viewCount);
    filters.push(
      `[${lastOut}]drawtext=fontfile='${FONT_REGULAR}':text='${esc(viewsLine)}':` +
        `x=${TEXT_X}:y=${y4}:fontsize=24:fontcolor=0x888888[bg5]`,
    );
    lastOut = 'bg5';

    filters.push(
      `[${lastOut}]drawtext=fontfile='${FONT_BOLD}':text='Watch on YouTube →':` +
        `x=${TEXT_X}:y=${y4 + 42}:fontsize=26:fontcolor=0xFF0000[bg6]`,
    );
    lastOut = 'bg6';
  } else {
    filters.push(
      `[${lastOut}]drawtext=fontfile='${FONT_BOLD}':text='Watch on YouTube →':` +
        `x=${TEXT_X}:y=${y4}:fontsize=26:fontcolor=0xFF0000[bg5]`,
    );
    lastOut = 'bg5';
  }

  const filterComplex = filters.join(';');

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${BG}:size=${W}x${H}:rate=1`,
    '-i', thumbnailPath,
    '-filter_complex', filterComplex,
    '-map', `[${lastOut}]`,
    '-frames:v', '1',
    '-q:v', '3',
    outputPath,
  ];

  try {
    await execFileAsync('ffmpeg', args);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw AppError.internal(`ffmpeg render failed: ${msg}`);
  }

  return outputPath;
}
