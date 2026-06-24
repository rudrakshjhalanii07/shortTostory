/**
 * Pulls the first http(s) URL out of shared text. YouTube's share sheet hands
 * over either a bare URL or "Video title\nhttps://youtube.com/shorts/…", so we
 * scan for the URL rather than assuming the whole string is one.
 */
export function extractSharedUrl(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}
