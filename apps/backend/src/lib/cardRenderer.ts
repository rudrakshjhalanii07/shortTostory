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

// Card: 1080×1920  (Instagram Story 9:16)
const W = 1080;
const H = 1920;

// Thumbnail: 16:9, 60 px side margins → 960×540
const THUMB_W = 960;
const THUMB_H = 540;
const THUMB_X = 60;
const THUMB_Y = 200;

const ACCENT_W = 64;

// Derived layout constants
const PANEL_Y  = THUMB_Y + THUMB_H + 28;  // 768 — dark content panel start
const ACCENT_Y = PANEL_Y + 20;            // 788 — red accent line
const TITLE1_Y = ACCENT_Y + 28;           // 816
const TITLE2_Y = TITLE1_Y + 52;           // 868
const CTA_Y    = 1100;
const FOOTER_Y = H - 72;                  // 1848

export interface RenderCardInput {
  jobId: string;
  thumbnailPath: string;
  metadata: VideoMetadata;
}

function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

/**
 * Word-wrap text into at most maxLines lines of maxChars each.
 * The final line is hard-truncated with "…" if remaining words overflow.
 */
function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const candidate = cur ? `${cur} ${word}` : word;
    if (candidate.length <= maxChars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      if (lines.length >= maxLines - 1) {
        lines.push(truncate(words.slice(i).join(' '), maxChars));
        cur = '';
        break;
      }
      cur = word;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

/**
 * Render a 1080×1920 JPEG attribution card using ffmpeg.
 * Returns the path to the output file. Caller is responsible for cleanup.
 *
 * Design: blurred+darkened thumbnail fills the full canvas as a cinematic
 * background. A clear 960×540 thumbnail sits in the upper zone. Channel
 * identity floats above it; video title, stats, and CTA sit below on a
 * semi-transparent dark panel.
 */
export async function renderCard({ jobId, thumbnailPath, metadata }: RenderCardInput): Promise<string> {
  const outputPath = join(tmpdir(), `shortstory-card-${jobId}.jpg`);

  // At ~22 px average char width for 40 px Inter Bold with 920 px available
  const titleLines  = wrapLines(metadata.title, 38, 2);
  const channelLine = truncate(metadata.channelTitle, 28);
  const handleLine  = truncate(metadata.creatorHandle, 36);

  const filters: string[] = [];
  let n = 0;
  const L  = () => `s${n}`;
  const NL = () => { n++; return `s${n}`; };

  // ── Background: thumbnail scaled to fill 1080×1920, blurred and darkened ──
  filters.push(
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
      `crop=${W}:${H},boxblur=40:3,` +
      `colorchannelmixer=0.12:0:0:0:0:0.12:0:0:0:0:0.12:0[bgblur]`,
  );

  // ── Clear thumbnail scaled to exactly 960×540 ──
  filters.push(
    `[0:v]scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,` +
      `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:color=black[thumb]`,
  );

  // ── Composite: thumbnail on blurred BG ──
  filters.push(`[bgblur][thumb]overlay=x=${THUMB_X}:y=${THUMB_Y}[${NL()}]`);

  // ── Content panel: semi-transparent dark rectangle below thumbnail ──
  filters.push(
    `[${L()}]drawbox=x=0:y=${PANEL_Y}:w=${W}:h=${H - PANEL_Y}:` +
      `color=0x080808@0.92:t=fill[${NL()}]`,
  );

  // ── Channel name — floats above thumbnail ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_BOLD}':text='${esc(channelLine)}':` +
      `x=(w-text_w)/2:y=64:fontsize=46:fontcolor=0xFFFFFF[${NL()}]`,
  );

  // ── Creator handle ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_REGULAR}':text='${esc(handleLine)}':` +
      `x=(w-text_w)/2:y=122:fontsize=28:fontcolor=0x888888[${NL()}]`,
  );

  // ── Red accent line (centered) ──
  filters.push(
    `[${L()}]drawbox=x=(w-${ACCENT_W})/2:y=${ACCENT_Y}:w=${ACCENT_W}:h=4:color=0xFF2222:t=fill[${NL()}]`,
  );

  // ── Video title line 1 ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_BOLD}':text='${esc(titleLines[0] ?? '')}':` +
      `x=(w-text_w)/2:y=${TITLE1_Y}:fontsize=40:fontcolor=0xFFFFFF[${NL()}]`,
  );

  // ── Video title line 2 (optional) ──
  if (titleLines[1]) {
    filters.push(
      `[${L()}]drawtext=fontfile='${FONT_BOLD}':text='${esc(titleLines[1])}':` +
        `x=(w-text_w)/2:y=${TITLE2_Y}:fontsize=40:fontcolor=0xFFFFFF[${NL()}]`,
    );
  }

  // ── View count ──
  const viewsY = (titleLines[1] ? TITLE2_Y : TITLE1_Y) + 60;
  if (metadata.viewCount !== undefined) {
    const viewsLine = formatViews(metadata.viewCount);
    filters.push(
      `[${L()}]drawtext=fontfile='${FONT_REGULAR}':text='${esc(viewsLine)}':` +
        `x=(w-text_w)/2:y=${viewsY}:fontsize=26:fontcolor=0x555555[${NL()}]`,
    );
  }

  // ── CTA ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_BOLD}':text='Watch on YouTube →':` +
      `x=(w-text_w)/2:y=${CTA_Y}:fontsize=34:fontcolor=0xFF3333[${NL()}]`,
  );

  // ── Footer watermark — bottom-right ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_REGULAR}':text='ShortToStory':` +
      `x=w-text_w-${ACCENT_W}:y=${FOOTER_Y}:fontsize=22:fontcolor=0x3A3A3A[${NL()}]`,
  );

  const filterComplex = filters.join(';');

  const args = [
    '-y',
    '-i', thumbnailPath,
    '-filter_complex', filterComplex,
    '-map', `[${L()}]`,
    '-frames:v', '1',
    '-q:v', '2',
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
