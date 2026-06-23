const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract an 11-character YouTube video ID from a Short URL.
 * Accepts:
 *   https://www.youtube.com/shorts/{id}
 *   https://youtu.be/{id}
 *   https://www.youtube.com/watch?v={id}
 * Returns null for anything that doesn't match or whose extracted ID fails
 * the 11-char pattern check. The caller is responsible for throwing.
 */
export function extractVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const { hostname, pathname, searchParams } = url;

  let id: string | null = null;

  if (hostname === 'youtu.be') {
    // First path segment is the video id.
    id = pathname.slice(1).split('/')[0] ?? null;
  } else if (hostname === 'www.youtube.com' || hostname === 'youtube.com') {
    if (pathname.startsWith('/shorts/')) {
      id = pathname.slice('/shorts/'.length).split('/')[0] ?? null;
    } else if (pathname === '/watch') {
      id = searchParams.get('v');
    }
  }

  if (!id || !VIDEO_ID_RE.test(id)) return null;
  return id;
}
