# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 5 — ffmpeg card pipeline  
**Next phase:** Phase 6 — REST API (POST /jobs, GET /jobs/:id) + S3 upload

Both `@shortstory/shared` and `@shortstory/backend` typecheck clean with 0
errors. The repo is committed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).

---

## What was just completed (Phase 5)

- **`src/lib/thumbnail.ts`** — `downloadThumbnail(url, jobId)`: fetches via
  native `fetch`, writes buffer to `os.tmpdir()/shortstory-thumb-{jobId}.jpg`,
  throws `AppError.internal()` on HTTP error.

- **`src/lib/cardRenderer.ts`** — `renderCard({ jobId, thumbnailPath, metadata })`:
  shells to `ffmpeg` via `execFile` (not `exec` — no shell injection risk).
  Produces a 1080×1920 JPEG at `os.tmpdir()/shortstory-card-{jobId}.jpg`.
  Layout:
  - Dark background (`#0F0F0F`), 1080×1920
  - Thumbnail scaled to 888 px wide, overlaid at y=160, padded to 499 px tall
  - Separator line at y≈719
  - Text block: channel title (Inter Bold 32 px), creator handle (Regular 26 px
    grey), video title (Regular 30 px), view count if present (24 px grey),
    "Watch on YouTube →" CTA (Bold 26 px red)
  - All text values truncated to a single-line character limit before being
    passed to `drawtext`; special chars (`:`, `\`, `'`, `,`) are escaped.

- **`apps/backend/assets/fonts/`** — Inter Regular and Bold TTFs (Inter v4.0,
  SIL OFL license) committed to the repo. Font paths resolved at runtime via
  `new URL('../../assets/fonts', import.meta.url)` — works correctly in both
  `src/lib/` (dev) and `dist/lib/` (production).

- **`Dockerfile`** — production stage now includes
  `COPY apps/backend/assets ./apps/backend/assets` so fonts are present at
  runtime.

- **Worker** (`src/workers/cardWorker.ts`): full pipeline wired:
  1. Extract video ID → fetch metadata → update progress 33 %
  2. Download thumbnail → update progress 66 %
  3. Render card → update progress 90 %
  4. `finally` block cleans up both temp files (thumbnail always; card path
     currently also cleaned because Phase 6 upload is not yet implemented).

---

## Immediate next steps (Phase 6)

Phase 6 has two independent halves that can be built in either order:

### 6A — S3 upload (`src/lib/s3Uploader.ts`)

Use the AWS SDK v3 (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`).
Do **not** use v2 — it ships as CJS and breaks NodeNext.

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner \
  --workspace @shortstory/backend
```

Implement:

```ts
export interface UploadResult {
  key: string;
  downloadUrl: string; // pre-signed GET URL
  expiresAt: string;   // ISO-8601, now + config.SIGNED_URL_TTL_SECONDS
}

export async function uploadCard(
  cardPath: string,
  jobId: string,
): Promise<UploadResult>
```

- Object key: `cards/{jobId}.jpg`
- Content-Type: `image/jpeg`
- Pre-sign a `GetObjectCommand` for `SIGNED_URL_TTL_SECONDS` (default 3600).
- Delete the local card temp file after a successful upload.
- On any AWS error throw `AppError.internal()`.

Config vars already in Zod schema: `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (optional, for
MinIO/Localstack in dev).

### 6B — REST API routes (`src/routes/jobs.ts`)

Two endpoints, mounted at `API_BASE_PATH` (`/api/v1`):

**`POST /api/v1/jobs`**

```
Body (JSON): CreateJobRequest  { url: string }
Response:    CreateJobResponse { jobId, state: 'queued', pollIntervalMs: 2000 }
```

Steps:
1. Parse body with Zod — throw `AppError.badRequest()` on invalid shape.
2. Call `extractVideoId(url)` — throw `AppError.invalidUrl()` on null.
3. Create a `Job` record with `saveJob`.
4. Add to `cardQueue` with `cardQueue.add('card', { jobId, sourceUrl: url })`.
5. Return `201` with `CreateJobResponse`.

**`GET /api/v1/jobs/:id`**

```
Response: JobStatusResponse — from toJobStatusResponse(job)
```

Steps:
1. Call `getJob(id)` — throw `AppError.notFound()` if null.
2. Return `200` with `toJobStatusResponse(job)`.

Mount the router in `app.ts`:
```ts
import { jobsRouter } from './routes/jobs.js';
app.use(API_BASE_PATH, jobsRouter);
```

### 6C — Wire S3 upload into the worker

Replace the `// TODO(phase-6)` comment in `processCard`:

```ts
// After render (cardPath is set, progress at 90 %):
const upload = await uploadCard(cardPath, jobId);
await updateJob(jobId, {
  state: 'completed',
  result: {
    downloadUrl: upload.downloadUrl,
    contentType: 'image/jpeg',
    expiresAt: upload.expiresAt,
    attributionLinkUrl: metadata.shortUrl,
    width: 1080,
    height: 1920,
  },
});
```

Remove `cardPath` from the `finally` cleanup — `uploadCard` deletes it after a
successful upload; on failure the `finally` block should delete it as a
fallback. Use a `uploadDone` flag:

```ts
let uploadDone = false;
// ... upload ...
uploadDone = true;
// in finally: if (!uploadDone && cardPath) await cleanupFile(cardPath);
```

### 6D — Config: require S3 vars in production

Add production guards to `src/config/index.ts` for `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

---

## Critical constraints — never violate

- **No `yt-dlp` or any video-stream download.** See ADR-001 and
  `docs/compliance.md`. If any dependency pulls it in transitively, remove it.
- **All error codes that the mobile client handles explicitly must live in
  `JobErrorCode` in `@shortstory/shared`**, not as local string literals in
  the backend (ADR-004).
- **Rebuild `@shortstory/shared` before typechecking `@shortstory/backend`.**
  The backend imports from the compiled `dist/` — stale dist = false clean.
- **AWS SDK v3 only** (`@aws-sdk/*`). v2 is CJS and breaks NodeNext.

---

## Repo quick-reference

```
packages/shared/src/
  job.ts              JobState, JobErrorCode, Job, CardResult
  metadata.ts         VideoMetadata (all fields), MAX_VIDEO_DURATION_SECONDS (90s)
  api.ts              CreateJobRequest/Response, JobStatusResponse, ApiErrorResponse
  index.ts            re-exports everything

apps/backend/
  assets/fonts/       Inter-Regular.ttf, Inter-Bold.ttf (SIL OFL, Inter v4.0)
  src/
    config/index.ts         Zod env validation (REDIS_URL + YOUTUBE_API_KEY required in prod)
    lib/logger.ts           Pino singleton
    lib/redis.ts            ioredis singleton (getRedis) + bullMQConnection options
    lib/jobStore.ts         saveJob / getJob / updateJob (Redis JSON, 24h TTL)
    lib/youtubeUrl.ts       extractVideoId() — Shorts/youtu.be/watch → 11-char ID or null
    lib/youtubeClient.ts    fetchVideoMetadata() — YouTube Data API v3
    lib/thumbnail.ts        downloadThumbnail() — fetch to tmp file, returns path
    lib/cardRenderer.ts     renderCard() — ffmpeg 1080×1920 JPEG with Inter font overlays
    types/errors.ts         AppError — factories: badRequest, notFound, invalidUrl,
                            videoTooLong, internal
    middleware/             requestId, requestLogger, errorHandler
    routes/health.ts        GET /health (Node uptime + Redis ping)
    queues/cardQueue.ts     BullMQ Queue<CardJobData>
    workers/cardWorker.ts   BullMQ Worker; full pipeline through render, TODO(phase-6) upload
    app.ts                  Express factory (Redis rate-limit store)
    server.ts               Entry point + graceful shutdown
  Dockerfile          Multi-stage; Node 20 Alpine; ffmpeg + dumb-init installed

docker-compose.yml    backend + redis:7-alpine (AOF, health-check ordering)

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
