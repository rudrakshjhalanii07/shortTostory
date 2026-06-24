// Web equivalent of the native ADD_TO_STORY / instagram-stories:// flows used by
// the Android/iOS apps. The web platform has no API to drop an image directly
// onto the Instagram Story canvas, so the best we can do is hand the rendered
// card to the OS share sheet (Web Share API Level 2, with files). The user then
// picks Instagram and places it on their Story manually.

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

async function fetchCardFile(downloadUrl: string): Promise<File> {
  const res = await fetch(downloadUrl, { mode: 'cors' });
  if (!res.ok) throw new Error(`Could not load card image (HTTP ${res.status}).`);
  const blob = await res.blob();
  const type = blob.type || 'image/jpeg';
  const ext = type.includes('png') ? 'png' : 'jpg';
  return new File([blob], `shortstory-card.${ext}`, { type });
}

function triggerDownload(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Share the rendered card. Returns how the share resolved so the UI can guide
 * the user (e.g. "saved to your photos — open Instagram and add it to a Story").
 */
export async function shareCard(
  downloadUrl: string,
  attributionLinkUrl: string,
): Promise<ShareOutcome> {
  const file = await fetchCardFile(downloadUrl);

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  const shareData: ShareData = {
    files: [file],
    title: 'ShortStory',
    text: attributionLinkUrl,
  };

  // Prefer the native share sheet when it can carry files (iOS Safari 15+,
  // Android Chrome). canShare with files must be checked separately.
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share(shareData);
      return 'shared';
    } catch (err) {
      // AbortError = user dismissed the sheet; treat as a cancel, not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
      // Fall through to download on any other share failure.
    }
  }

  // Desktop browsers and unsupported mobile browsers: save the image so the
  // user can upload it to a Story from their gallery.
  triggerDownload(file);
  return 'downloaded';
}
