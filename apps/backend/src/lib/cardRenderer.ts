import { execFile } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
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
const LOGO_PATH = fileURLToPath(new URL('../../assets/logo.png', import.meta.url));

// Card: 1080×1920  (Instagram Story 9:16)
const W = 1080;
const H = 1920;

// Thumbnail: 16:9 → 960×540, centered horizontally
const THUMB_W = 960;
const THUMB_H = 540;

const ACCENT_W = 64;
const ACCENT_X = (W - ACCENT_W) / 2;     // drawbox doesn't eval expressions

// Vertical rhythm for the centered content block (drawtext y = glyph top).
// The whole stack — channel, handle, thumbnail, accent, title, views, CTA —
// is measured then centered vertically on the canvas.
const NAME_LH          = 58;
const HANDLE_LH        = 40;
const GAP_HANDLE_THUMB = 50;
const GAP_THUMB_ACCENT = 56;
const ACCENT_H         = 4;
const GAP_ACCENT_TITLE = 30;
const TITLE_LH         = 54;
const GAP_TITLE_VIEWS  = 24;
const VIEWS_LH         = 34;
const GAP_VIEWS_CTA    = 40;
const CTA_H            = 44;

// Branding lockup (logo + "ShortToStory"), centered horizontally and kept well
// inside Instagram's bottom safe zone so the caption/sticker bar can't cover it.
// Instagram reserves roughly the bottom ~250 px for its own UI, so the old
// H-96 footer sat squarely under the caption box — we raise it to H-300.
const BRAND_TEXT = 'shortToStory';
const BRAND_FONTSIZE = 38;
const LOGO_SIZE = 56;
const BRAND_GAP = 16;
// Measured width of "ShortToStory" in Inter-Bold @38 px (constant string).
const BRAND_TEXT_W = 256;
const BRAND_LOCKUP_W = LOGO_SIZE + BRAND_GAP + BRAND_TEXT_W;
const BRAND_X = Math.round((W - BRAND_LOCKUP_W) / 2);
const BRAND_Y = H - 300;
const LOGO_X = BRAND_X;
const TEXT_X = BRAND_X + LOGO_SIZE + BRAND_GAP;
// Vertically center the logo against the text's cap height.
const LOGO_Y = BRAND_Y - Math.round((LOGO_SIZE - BRAND_FONTSIZE) / 2);

export interface RenderCardInput {
  jobId: string;
  thumbnailPath: string;
  metadata: VideoMetadata;
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
 * Design: the thumbnail blurred + desaturated fills the canvas as a pastel
 * background with a dark→light vertical gradient. A centered content block
 * (channel identity, clear 960×540 thumbnail, accent line, title, views, CTA)
 * is measured and centered vertically. A "ShortToStory" credit sits bottom-right.
 *
 * Text injection: all user-supplied strings go through drawtext's `textfile=`
 * option (written to a temp file) rather than inline `text=`. This means the
 * text content never touches filtergraph syntax, so no character — colon,
 * bracket, quote, emoji, RTL mark — can break the filter.
 */
export async function renderCard({ jobId, thumbnailPath, metadata }: RenderCardInput): Promise<string> {
  const outputPath = join(tmpdir(), `shortstory-card-${jobId}.jpg`);

  // At ~22 px average char width for 40 px Inter Bold with 920 px available
  const titleLines  = wrapLines(metadata.title, 38, 2);
  const channelLine = truncate(metadata.channelTitle, 28);
  const handleLine  = truncate(metadata.creatorHandle, 36);

  const hasViews = metadata.viewCount !== undefined;
  const viewsLine = hasViews ? formatViews(metadata.viewCount!) : '';

  // ── Measure the block so we can center it vertically ──
  const blockH =
    NAME_LH +
    HANDLE_LH +
    GAP_HANDLE_THUMB + THUMB_H +
    GAP_THUMB_ACCENT + ACCENT_H +
    GAP_ACCENT_TITLE + titleLines.length * TITLE_LH +
    (hasViews ? GAP_TITLE_VIEWS + VIEWS_LH : 0) +
    GAP_VIEWS_CTA + CTA_H;

  // Lay out top-to-bottom from the centered start, advancing a cursor.
  let y = Math.round((H - blockH) / 2);
  const nameY = y;            y += NAME_LH;
  const handleY = y;          y += HANDLE_LH + GAP_HANDLE_THUMB;
  const thumbY = y;           y += THUMB_H + GAP_THUMB_ACCENT;
  const accentY = y;          y += ACCENT_H + GAP_ACCENT_TITLE;
  const titleY = y;           y += titleLines.length * TITLE_LH;
  let viewsY = 0;
  if (hasViews)             { y += GAP_TITLE_VIEWS; viewsY = y; y += VIEWS_LH; }
  const ctaY = y + GAP_VIEWS_CTA;

  // Write all text strings to temp files so they bypass filtergraph parsing
  // entirely. The file paths are controlled (/tmp/shortstory-txt-{uuid}-{label}.txt)
  // and contain no special chars, so they're safe to single-quote in the filter.
  const textFiles: string[] = [];
  const tf = async (content: string, label: string): Promise<string> => {
    const p = join(tmpdir(), `shortstory-txt-${jobId}-${label}.txt`);
    await writeFile(p, content, 'utf8');
    textFiles.push(p);
    return p;
  };

  const [
    channelFile,
    handleFile,
    ...titleAndRest
  ] = await Promise.all([
    tf(channelLine, 'channel'),
    tf(handleLine, 'handle'),
    ...titleLines.map((l, i) => tf(l, `title${i}`)),
    ...(hasViews ? [tf(viewsLine, 'views')] : []),
    tf('Watch on YouTube →', 'cta'),
    tf(BRAND_TEXT, 'brand'),
  ]);

  // Unpack the remaining files in the order they were created above.
  const titleFiles = titleLines.map((_, i) => titleAndRest[i]!);
  const afterTitles = titleAndRest.slice(titleLines.length);
  const viewsFile  = hasViews ? afterTitles[0]! : null;
  const ctaFile    = hasViews ? afterTitles[1]! : afterTitles[0]!;
  const brandFile  = hasViews ? afterTitles[2]! : afterTitles[1]!;

  const filters: string[] = [];
  let n = 0;
  const L  = () => `s${n}`;
  const NL = () => { n++; return `s${n}`; };

  // ── Background: thumbnail blurred + desaturated, with a vertical brightness
  //    gradient (dark at top → lighter pastel at bottom). Applied to the BG
  //    only so the foreground thumbnail stays crisp. ──
  const grad = `(0.28+0.34*Y/${H})`;
  filters.push(
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
      `crop=${W}:${H},boxblur=40:3,hue=s=0.5,` +
      `geq=r='r(X,Y)*${grad}':g='g(X,Y)*${grad}':b='b(X,Y)*${grad}'[bg]`,
  );

  // ── Clear thumbnail scaled to exactly 960×540 ──
  filters.push(
    `[0:v]scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,` +
      `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:color=black[thumb]`,
  );

  // ── Composite: thumbnail centered horizontally, at the measured Y ──
  filters.push(`[bg][thumb]overlay=x=(main_w-overlay_w)/2:y=${thumbY}[${NL()}]`);

  // ── Channel name ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_BOLD}':textfile='${channelFile}':` +
      `x=(w-text_w)/2:y=${nameY}:fontsize=46:fontcolor=0xFFFFFF[${NL()}]`,
  );

  // ── Creator handle ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_REGULAR}':textfile='${handleFile}':` +
      `x=(w-text_w)/2:y=${handleY}:fontsize=28:fontcolor=0xAAAAAA[${NL()}]`,
  );

  // ── Red accent line (centered — drawbox uses iw not w, so we hardcode x) ──
  filters.push(
    `[${L()}]drawbox=x=${ACCENT_X}:y=${accentY}:w=${ACCENT_W}:h=${ACCENT_H}:color=0xFF2222:t=fill[${NL()}]`,
  );

  // ── Video title (1–2 centered lines) ──
  titleFiles.forEach((file, i) => {
    filters.push(
      `[${L()}]drawtext=fontfile='${FONT_BOLD}':textfile='${file}':` +
        `x=(w-text_w)/2:y=${titleY + i * TITLE_LH}:fontsize=40:fontcolor=0xFFFFFF[${NL()}]`,
    );
  });

  // ── View count ──
  if (hasViews && viewsFile) {
    filters.push(
      `[${L()}]drawtext=fontfile='${FONT_REGULAR}':textfile='${viewsFile}':` +
        `x=(w-text_w)/2:y=${viewsY}:fontsize=26:fontcolor=0x999999[${NL()}]`,
    );
  }

  // ── CTA ──
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_BOLD}':textfile='${ctaFile}':` +
      `x=(w-text_w)/2:y=${ctaY}:fontsize=34:fontcolor=0xFF3333[${NL()}]`,
  );

  // ── Branding lockup — logo + "ShortToStory", centered in the safe zone ──
  // Scale the logo from the 2nd input, draw the brand text, then overlay the
  // logo to its left as a single centered lockup.
  filters.push(`[1:v]scale=${LOGO_SIZE}:${LOGO_SIZE}[logo]`);
  filters.push(
    `[${L()}]drawtext=fontfile='${FONT_BOLD}':textfile='${brandFile}':` +
      `x=${TEXT_X}:y=${BRAND_Y}:fontsize=${BRAND_FONTSIZE}:fontcolor=0xFFFFFF[${NL()}]`,
  );
  filters.push(`[${L()}][logo]overlay=x=${LOGO_X}:y=${LOGO_Y}[${NL()}]`);

  const filterComplex = filters.join(';');

  const args = [
    '-y',
    '-i', thumbnailPath,
    '-i', LOGO_PATH,
    '-filter_complex', filterComplex,
    '-map', `[${L()}]`,
    '-frames:v', '1',
    '-q:v', '2',
    outputPath,
  ];

  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024 });
  } catch (cause) {
    // execFile rejects with an Error carrying `stderr` — that holds ffmpeg's
    // actual diagnostic. `cause.message` is only the generic "Command failed"
    // line, so surface stderr (last lines) to make production failures legible.
    const stderr =
      cause && typeof cause === 'object' && 'stderr' in cause
        ? String((cause as { stderr: unknown }).stderr)
        : '';
    const tail = stderr.trim().split('\n').slice(-8).join('\n');
    const base = cause instanceof Error ? cause.message : String(cause);
    throw AppError.internal(`ffmpeg render failed: ${base}${tail ? `\n${tail}` : ''}`);
  } finally {
    await Promise.all(textFiles.map(p => unlink(p).catch(() => {})));
  }

  return outputPath;
}
