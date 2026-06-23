# Compliance Decision Record

> This document is the *why* behind ShortStory's architecture. Read it before
> proposing any change that touches video ingestion.

## The problem with the obvious design

The naive design — "accept any YouTube URL, download the video with `yt-dlp`,
re-upload it to Instagram with a credit overlay" — fails on four fronts:

| Risk | Detail |
| --- | --- |
| **YouTube ToS** | Server-side downloading via `yt-dlp` violates YouTube's Terms of Service regardless of attribution. Datacenter IPs doing it at scale get blocked. |
| **Copyright** | Re-encoding and republishing the whole work is reproduction + distribution + derivative creation. Attribution is not a license and not a fair-use defense. |
| **Instagram** | Audio fingerprinting mutes/flags reposted Shorts; Meta terms prohibit republishing content you lack rights to. |
| **App Store / Play** | Apple Guideline 5.2.3 and Google Play reject apps that facilitate downloading from third-party services. A "YouTube → download" share extension reads as a ripper. |

## The decision: Model B — Attribution Card

ShortStory **never downloads or redistributes the source video.** Instead it
generates a **branded attribution card** in Instagram Story format from:

- **Metadata** from the official **YouTube Data API v3** (licensed for this use).
- The **thumbnail** the API returns.

The card carries the required credits (channel, handle, title, channel URL,
upload date; optionally view count / music) burned in via ffmpeg, plus a
tappable **link sticker** pointing back to the original Short on YouTube.

### Why this clears each risk

- **YouTube ToS / copyright:** no video bytes are downloaded or republished. We
  share a *citation*, which drives traffic back to the creator.
- **Instagram:** no copyrighted audio is present, so nothing to fingerprint.
- **App Store / Play:** the app is a "create-an-attribution-card" tool, not a
  downloader — it never ingests third-party video.

## Guardrails (do not remove)

1. No `yt-dlp` or any video-stream download dependency in the backend.
2. Thumbnail usage stays within YouTube API terms (attribution/citation only).
3. The `license` field is captured so a future, explicitly-licensed full-video
   model (Creative Commons / creator-consent) can be added without reopening
   these risks.
