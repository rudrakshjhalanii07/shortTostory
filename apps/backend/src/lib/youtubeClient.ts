import { type VideoMetadata, type YouTubeLicense } from '@shortstory/shared';
import { config } from '../config/index.js';
import { AppError } from '../types/errors.js';

// ---------------------------------------------------------------------------
// ISO 8601 duration parser (e.g. PT1M30S → 90)
// ---------------------------------------------------------------------------

function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const hours = parseInt(m[1] ?? '0', 10);
  const minutes = parseInt(m[2] ?? '0', 10);
  const seconds = parseInt(m[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// ---------------------------------------------------------------------------
// YouTube Data API v3 response shapes (only fields we consume)
// ---------------------------------------------------------------------------

interface VideoItem {
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: Record<string, { url: string } | undefined>;
  };
  contentDetails: { duration: string };
  statistics?: { viewCount?: string };
  status: { license: string };
}

interface ChannelItem {
  id: string;
  snippet: {
    customUrl?: string;
    title: string;
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = config.YOUTUBE_API_KEY;
  if (!key) {
    throw AppError.internal('YOUTUBE_API_KEY is not configured.');
  }
  const qs = new URLSearchParams({ ...params, key }).toString();
  const res = await fetch(`${YT_BASE}/${path}?${qs}`);
  if (!res.ok) {
    throw AppError.internal(`YouTube API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function bestThumbnail(thumbnails: Record<string, { url: string } | undefined>): string {
  return (
    thumbnails['maxres']?.url ??
    thumbnails['high']?.url ??
    thumbnails['medium']?.url ??
    thumbnails['default']?.url ??
    ''
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  // Call 1 — videos.list
  const videosRes = await ytFetch<{ items?: VideoItem[] }>('videos', {
    part: 'snippet,contentDetails,statistics,status',
    id: videoId,
  });

  const item = videosRes.items?.[0];
  if (!item) {
    throw AppError.notFound(`Video "${videoId}" was not found on YouTube.`);
  }

  const durationSeconds = parseIsoDuration(item.contentDetails.duration);

  const { snippet, statistics, status } = item;
  const channelId = snippet.channelId;

  // Call 2 — channels.list
  const channelsRes = await ytFetch<{ items?: ChannelItem[] }>('channels', {
    part: 'snippet',
    id: channelId,
  });

  const channel = channelsRes.items?.[0];

  let creatorHandle: string;
  let channelUrl: string;

  if (channel?.snippet.customUrl) {
    creatorHandle = channel.snippet.customUrl.startsWith('@')
      ? channel.snippet.customUrl
      : `@${channel.snippet.customUrl}`;
    channelUrl = `https://www.youtube.com/${channel.snippet.customUrl}`;
  } else {
    const fallbackHandle = (channel?.snippet.title ?? snippet.channelTitle)
      .toLowerCase()
      .replace(/\s+/g, '');
    creatorHandle = `@${fallbackHandle}`;
    channelUrl = `https://www.youtube.com/channel/${channelId}`;
  }

  const license: YouTubeLicense =
    status.license === 'creativeCommon' ? 'creativeCommon' : 'youtube';

  const viewCount =
    statistics?.viewCount !== undefined ? parseInt(statistics.viewCount, 10) : undefined;

  return {
    videoId,
    shortUrl: `https://www.youtube.com/shorts/${videoId}`,
    channelTitle: snippet.channelTitle,
    creatorHandle,
    title: snippet.title,
    channelUrl,
    publishedAt: snippet.publishedAt,
    thumbnailUrl: bestThumbnail(snippet.thumbnails),
    license,
    durationSeconds,
    ...(viewCount !== undefined && { viewCount }),
  };
}
