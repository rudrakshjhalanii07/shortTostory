# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 4 — YouTube Data API integration  
**Next phase:** Phase 5 — ffmpeg card pipeline

Both `@shortstory/shared` and `@shortstory/backend` typecheck clean with 0
errors. The repo is committed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).

---

## What was just completed (Phase 4)

- **Config** (`src/config/index.ts`): `YOUTUBE_API_KEY` now required in
  production (same guard pattern as `REDIS_URL`).

- **URL extractor** (`src/lib/youtubeUrl.ts`): `extractVideoId(raw)` handles
  the three canonical YouTube Short URL forms (Shorts canonical, `youtu.be`
  redirect, watch URL). Returns `null` on mismatch or if the extracted segment
  fails the 11-char `[A-Za-z0-9_-]{11}` regex.

- **YouTube API client** (`src/lib/youtubeClient.ts`): `fetchVideoMetadata(videoId)`
  makes two sequential calls via native `fetch` (no `googleapis`/`axios`):
  - `videos.list` — `snippet,contentDetails,statistics,status` — maps all
    `VideoMetadata` required fields; rejects if `items` empty (`notFound`) or
    `durationSeconds > 90` (`videoTooLong`).
  - `channels.list` — resolves `creatorHandle` from `snippet.customUrl` with
    a lowercase/stripped fallback for channels without a handle; constructs
    `channelUrl` accordingly.

- **Worker** (`src/workers/cardWorker.ts`): stub replaced. `processCard` now:
  1. Extracts video ID (throws `INVALID_URL` on null).
  2. Calls `fetchVideoMetadata` (throws `VIDEO_NOT_FOUND` or `VIDEO_TOO_LONG`
     on validation failures).
  3. Persists metadata + advances progress to `{ stage: 'downloading_thumbnail', percent: 33 }`.
  4. Wraps all `AppError` throws in a catch that calls `updateJob` with `state: 'failed'`
     before re-throwing so BullMQ records the failure correctly.

---

## Immediate next steps (Phase 5)

Phase 5 delivers the ffmpeg render pipeline. The worker currently halts at
`downloading_thumbnail / 33 %` — Phase 5 fills in the rest.

### 5.1 — Thumbnail downloader (`src/lib/thumbnail.ts`)

Download `metadata.thumbnailUrl` with native `fetch`. Write it to a temp file
under `os.tmpdir()`. Return the local path. On HTTP error → `AppError.internal()`.

Use a randomised filename (e.g. `shortstory-thumb-{jobId}.jpg`) to avoid
collisions under concurrency 2.

### 5.2 — Card renderer (`src/lib/cardRenderer.ts`)

Produce a 1080×1920 JPEG using ffmpeg. The card design:
- Background: solid dark colour (#0F0F0F or similar) or a blurred/scaled
  version of the thumbnail.
- Thumbnail inset: centered, scaled to fit ~90 % width.
- Text overlay (bottom third): channel title, creator handle, video title,
  view count (if present), "Watch on YouTube" CTA.

Shell out to ffmpeg using Node's `child_process.execFile` (not `exec`) to avoid
shell injection. Return the output file path. Clean up the thumbnail temp file
after the render succeeds or fails (use `finally`).

Font file must be bundled in the repo (no system-font assumption). Use a free
SIL-licensed font (e.g. Inter or Roboto) checked in to `assets/fonts/`.

### 5.3 — Wiring into the worker

Replace the `// TODO(phase-5)` comment in `processCard`:

```
// After metadata fetch + updateJob (progress 33 %):
// 4. downloadThumbnail(metadata.thumbnailUrl, jobId) → thumbnailPath
// 5. updateJob(jobId, { progress: { stage: 'rendering_card', percent: 66 } })
// 6. renderCard({ jobId, thumbnailPath, metadata }) → cardPath
// 7. updateJob(jobId, { progress: { stage: 'uploading_result', percent: 90 } })
// 8. TODO(phase-6): upload to S3 and set result
```

Extend the `AppError` error-code mapping in the catch block if new error
surfaces appear (e.g. `RENDER_FAILED`).

### 5.4 — Temp-file cleanup

All temp files (thumbnail, rendered card) must be deleted on both success and
failure paths. Use `fs.promises.unlink` in `finally` blocks; swallow `ENOENT`
errors silently (file may already be gone).

---

## Critical constraints — never violate

- **No `yt-dlp` or any video-stream download.** See ADR-001 and
  `docs/compliance.md`. If any dependency pulls it in transitively, remove it.
- **All error codes that the mobile client handles explicitly must live in
  `JobErrorCode` in `@shortstory/shared`**, not as local string literals in
  the backend (ADR-004).
- **Rebuild `@shortstory/shared` before typechecking `@shortstory/backend`.**
  The backend imports from the compiled `dist/` — stale dist = false clean.

---

## Repo quick-reference

```
packages/shared/src/
  job.ts              JobState, JobErrorCode, Job, CardResult
  metadata.ts         VideoMetadata (all fields), MAX_VIDEO_DURATION_SECONDS (90s)
  api.ts              CreateJobRequest/Response, JobStatusResponse, ApiErrorResponse
  index.ts            re-exports everything

apps/backend/src/
  config/index.ts         Zod env validation (REDIS_URL + YOUTUBE_API_KEY required in prod)
  lib/logger.ts           Pino singleton
  lib/redis.ts            ioredis singleton (getRedis) + bullMQConnection options
  lib/jobStore.ts         saveJob / getJob / updateJob (Redis JSON, 24h TTL)
  lib/youtubeUrl.ts       extractVideoId() — Shorts/youtu.be/watch → 11-char ID or null
  lib/youtubeClient.ts    fetchVideoMetadata() — YouTube Data API v3
  types/errors.ts         AppError — factories: badRequest, notFound, invalidUrl,
                          videoTooLong, internal
  middleware/             requestId, requestLogger, errorHandler
  routes/health.ts        GET /health (Node uptime + Redis ping)
  queues/cardQueue.ts     BullMQ Queue<CardJobData>
  workers/cardWorker.ts   BullMQ Worker; fetches metadata → halts at downloading_thumbnail
  app.ts                  Express factory (Redis rate-limit store)
  server.ts               Entry point + graceful shutdown

apps/backend/Dockerfile   Multi-stage; Node 20 Alpine; ffmpeg + dumb-init installed
docker-compose.yml        backend + redis:7-alpine (AOF, health-check ordering)

docs/
  architecture.md         System design + middleware stack
  compliance.md           Why no video download (read before touching ingestion)
  decisions.md            ADR-001 through ADR-007
  progress.md             Phase checklist + deliverables
```

**Dev workflow:**
```bash
npm run build:shared                         # always run first
npm run typecheck --workspace @shortstory/backend
npm run dev --workspace @shortstory/backend  # tsx watch, hot-reload
```

**Git:**
```
remote: https://github.com/rudrakshjhalanii07/shortTostory
branch: main
```
