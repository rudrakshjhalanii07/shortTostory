/**
 * Extracts the YouTube Short URL from a shortstory://share?url=… deep link.
 * Returns null for any unrecognised scheme or malformed input.
 */
export function parseShortStoryUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'shortstory:') return null;
    return u.searchParams.get('url');
  } catch {
    return null;
  }
}
