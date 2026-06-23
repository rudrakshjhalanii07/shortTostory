# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 6 — REST API + S3 upload  
**Next phase:** Phase 7 — Mobile foundation (Expo project, API client, polling, basic UI)

Both `@shortstory/shared` and `@shortstory/backend` typecheck clean with 0
errors. The repo is committed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).

---

## What was just completed (Phase 6)

### 6A — `src/lib/s3Uploader.ts`

`uploadCard(cardPath, jobId) → UploadResult`:
- Reads the card file into memory with `readFile`, sends via `PutObjectCommand`
  (`Content-Type: image/jpeg`, key `cards/{jobId}.jpg`).
- Pre-signs a `GetObjectCommand` with `SIGNED_URL_TTL_SECONDS` (default 3600).
- Deletes the local temp file after a successful upload.
- On any AWS SDK error, throws `AppError.internal()`.
- Uses `S3ClientConfig` for type-safe client construction under `exactOptionalPropertyTypes`.
- `S3_ENDPOINT` + `forcePathStyle: true` wired for MinIO/Localstack in dev.

### 6B — `src/routes/jobs.ts`

Two endpoints mounted at `API_BASE_PATH` (`/api/v1`):

**`POST /api/v1/jobs`**
1. Zod parse of `{ url: string }` → `AppError.badRequest()` on invalid shape.
2. `extractVideoId(url)` → `AppError.invalidUrl()` on null.
3. `saveJob` (uuid v4, state `queued`, `createdAt`/`updatedAt` ISO strings).
4. `cardQueue.add('card', { jobId, sourceUrl })`.
5. Returns `201` with `CreateJobResponse { jobId, state: 'queued', pollIntervalMs: 2000 }`.

**`GET /api/v1/jobs/:id`**
1. `getJob(id)` → `AppError.notFound()` if null.
2. Returns `200` with `toJobStatusResponse(job)`.

### 6C — Worker wired

`cardWorker.ts` now calls `uploadCard(cardPath, jobId)` after render,
persists `CardResult` via `updateJob`, and uses `uploadDone` flag so the
`finally` block only cleans up the card temp file on failure (not on success,
since `uploadCard` already deleted it).

### 6D — Config guards

`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` all
required in production; server exits with a clear message if any is absent.

---

## Immediate next steps (Phase 7)

Phase 7 is the mobile foundation. The backend API is now fully functional;
the mobile app needs to be scaffolded to talk to it.

### 7A — Expo project scaffold

```bash
npx create-expo-app apps/mobile --template blank-typescript
```

- Target: iOS first, Android parity later.
- Use Expo SDK 51+ (React Native 0.74+).
- Remove the default `App.tsx` content; replace with the shell below.

### 7B — API client (`apps/mobile/src/api/client.ts`)

Typed wrapper around the backend REST API using `@shortstory/shared` DTOs.
No external HTTP library needed — native `fetch` is available in RN 0.71+.

```ts
import type {
  CreateJobRequest,
  CreateJobResponse,
  JobStatusResponse,
} from '@shortstory/shared';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function createJob(url: string): Promise<CreateJobResponse> { ... }
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> { ... }
```

Use `EXPO_PUBLIC_API_URL` so it can be overridden at build time without code
changes (Expo's equivalent of `NEXT_PUBLIC_`).

### 7C — Polling hook (`apps/mobile/src/hooks/useJobPoller.ts`)

```ts
export function useJobPoller(jobId: string | null): {
  status: JobStatusResponse | null;
  error: string | null;
}
```

- Polls `getJobStatus` every `pollIntervalMs` ms (from `CreateJobResponse`).
- Stops polling when `state === 'completed' || state === 'failed'`.
- Clears the interval on unmount.
- Surfaces errors to the caller.

### 7D — Basic UI shell

Three screens (React Navigation stack, or Expo Router — pick one and stick
with it):

1. **HomeScreen** — single text field + "Generate" button. Accepts a YouTube
   URL. On submit, calls `createJob`, then navigates to `ProcessingScreen`.

2. **ProcessingScreen** — shows `JobProgress.stage` and `JobProgress.percent`.
   Uses `useJobPoller`. On `completed`, navigates to `ResultScreen`. On
   `failed`, shows the `JobError.message`.

3. **ResultScreen** — shows the card image fetched from `CardResult.downloadUrl`.
   Placeholder "Share to Story" button (wired in Phase 9).

---

## Critical constraints — never violate

- **No `yt-dlp` or any video-stream download.** See ADR-001 and
  `docs/compliance.md`.
- **All error codes the mobile client handles explicitly must live in
  `JobErrorCode` in `@shortstory/shared`**, not as local strings in the backend.
- **Rebuild `@shortstory/shared` before typechecking `@shortstory/backend`.**
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
    config/index.ts         Zod env validation (all required prod vars guarded)
    lib/logger.ts           Pino singleton
    lib/redis.ts            ioredis singleton (getRedis) + bullMQConnection options
    lib/jobStore.ts         saveJob / getJob / updateJob (Redis JSON, 24h TTL); JobUpdate includes result
    lib/youtubeUrl.ts       extractVideoId() — Shorts/youtu.be/watch → 11-char ID or null
    lib/youtubeClient.ts    fetchVideoMetadata() — YouTube Data API v3
    lib/thumbnail.ts        downloadThumbnail() — fetch to tmp file, returns path
    lib/cardRenderer.ts     renderCard() — ffmpeg 1080×1920 JPEG with Inter font overlays
    lib/s3Uploader.ts       uploadCard() — PutObject, pre-signed GET, deletes local file
    types/errors.ts         AppError — factories: badRequest, notFound, invalidUrl,
                            videoTooLong, internal
    middleware/             requestId, requestLogger, errorHandler
    routes/health.ts        GET /health (Node uptime + Redis ping)
    routes/jobs.ts          POST /api/v1/jobs + GET /api/v1/jobs/:id
    queues/cardQueue.ts     BullMQ Queue<CardJobData>
    workers/cardWorker.ts   BullMQ Worker; full pipeline → S3 upload → completed
    app.ts                  Express factory; jobs router mounted at /api/v1
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
