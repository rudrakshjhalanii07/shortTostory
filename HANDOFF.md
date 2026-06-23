# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 3 — Redis & BullMQ  
**Next phase:** Phase 4 — YouTube Data API integration

Both `@shortstory/shared` and `@shortstory/backend` typecheck clean with 0
errors. The repo is committed and pushed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).
Docker and docker-compose are wired but the image has not been built end-to-end
(Phase 10 hardening).

---

## What was just completed (Phase 3)

- **`ioredis` client** (`src/lib/redis.ts`): `getRedis()` singleton with
  exponential reconnect. `closeRedis()` called on graceful shutdown.
  `bullMQConnection = { url: REDIS_URL }` is passed to BullMQ so it manages
  its own connections internally (required for blocking commands — see ADR-007).

- **Job store** (`src/lib/jobStore.ts`): `saveJob` / `getJob` / `updateJob`
  persist `Job` records as JSON strings under `job:{id}` with a 24-hour TTL.

- **BullMQ Queue** (`src/queues/cardQueue.ts`): `cardQueue` — 3 attempts,
  exponential backoff (1 s base), 100-entry rolling retention.

- **BullMQ Worker** (`src/workers/cardWorker.ts`): `createCardWorker()` returns
  a worker (concurrency 2). Stub processor logs and returns. Event handlers on
  `active` / `completed` / `failed` advance the stored `Job` state machine.

- **Config tightening** (`src/config/index.ts`): `REDIS_URL` required in
  production; process exits with a readable message if absent.

- **Redis rate limiter** (`src/app.ts`): `express-rate-limit` memory store
  replaced with `RedisStore` from `rate-limit-redis@4`. ioredis's `.call()`
  is accessed via a type-cast (exists at runtime, absent from `.d.ts`).

- **Health endpoint** (`src/routes/health.ts`): now PINGs Redis and returns
  `{ redis: "ok" | "error" }`. Returns `status: "degraded"` if ping fails.

- **Graceful shutdown** (`src/server.ts`): shutdown sequence is
  `server.close()` → `worker.close()` → `closeRedis()`.

---

## Immediate next steps (Phase 4)

Phase 4 delivers the YouTube Data API integration that the worker stub
currently skips. Read `packages/shared/src/metadata.ts` before starting —
every field of `VideoMetadata` must be populated; Phase 4 owns all of them.

### 4.1 — Config: require `YOUTUBE_API_KEY` in production

`YOUTUBE_API_KEY` is already in the Zod schema as `optional`. Add the same
production guard that was added for `REDIS_URL` in Phase 3:

```ts
if (parsed.data.NODE_ENV === 'production' && !parsed.data.YOUTUBE_API_KEY) {
  console.error('[config] YOUTUBE_API_KEY is required in production');
  process.exit(1);
}
```

### 4.2 — Video ID extractor (`src/lib/youtubeUrl.ts`)

Extract the video ID from these URL forms:

| Form | Example |
|---|---|
| Shorts canonical | `https://www.youtube.com/shorts/{id}` |
| Short redirect | `https://youtu.be/{id}` |
| Watch URL | `https://www.youtube.com/watch?v={id}` |

Return `null` for anything that doesn't match. The caller throws
`AppError.invalidUrl()` on null. **Do not** attempt to confirm via HTTP
redirect — extract the ID and let the API call decide if it's a valid Short.

The video ID is always 11 characters (`[A-Za-z0-9_-]{11}`). Validate the
pattern after extraction.

### 4.3 — YouTube API client (`src/lib/youtubeClient.ts`)

Use native `fetch` (Node 18+) — do **not** add `googleapis` or `axios`; they
add weight and CJS complexity that conflicts with NodeNext. Make two sequential
API calls:

**Call 1 — videos.list** (gets all video-level data):

```
GET https://www.googleapis.com/youtube/v3/videos
  ?part=snippet,contentDetails,statistics,status
  &id={videoId}
  &key={YOUTUBE_API_KEY}
```

Map to `VideoMetadata` fields:

| API field | `VideoMetadata` field | Notes |
|---|---|---|
| `snippet.title` | `title` | — |
| `snippet.channelTitle` | `channelTitle` | — |
| `snippet.channelId` | used for Call 2 | stored temporarily |
| `snippet.publishedAt` | `publishedAt` | already ISO-8601 |
| `snippet.thumbnails` | `thumbnailUrl` | prefer `maxres`, fall back to `high`, then `medium` |
| `contentDetails.duration` | `durationSeconds` | parse ISO 8601 duration (e.g. `PT1M30S`) — write a small helper |
| `statistics.viewCount` | `viewCount` | optional; parse to number |
| `status.license` | `license` | `"youtube"` or `"creativeCommon"` |

If `items` is empty the video doesn't exist → `AppError.notFound()`.  
If `durationSeconds > MAX_VIDEO_DURATION_SECONDS` → `AppError.videoTooLong()`.

**Call 2 — channels.list** (gets the creator handle, required):

```
GET https://www.googleapis.com/youtube/v3/channels
  ?part=snippet
  &id={channelId}
  &key={YOUTUBE_API_KEY}
```

`snippet.customUrl` returns the handle, e.g. `"@mrbeast"`. Some older channels
have no custom URL — in that case fall back to `"@" + snippet.title` (lowercase,
spaces stripped) so `creatorHandle` is always non-empty. Construct `channelUrl`
as `"https://www.youtube.com/" + snippet.customUrl` (or
`"https://www.youtube.com/channel/" + channelId` if no custom URL).

Also construct `shortUrl` as `"https://www.youtube.com/shorts/" + videoId`.

### 4.4 — Wire into the worker (`src/workers/cardWorker.ts`)

Replace the `// TODO(phase-4)` stub in `processCard`:

```ts
// 1. Set state to processing / fetching_metadata (already done by 'active' event)
// 2. Extract video ID from sourceUrl → AppError.invalidUrl() on null
// 3. Call fetchVideoMetadata(videoId) → populates metadata on the job record
// 4. updateJob(jobId, { metadata, progress: { stage: 'downloading_thumbnail', percent: 33 } })
// 5. TODO(phase-5): download thumbnail and render card
```

On any `AppError` thrown inside the processor, catch it, call `updateJob` with
`state: 'failed'` and the appropriate `JobErrorCode`, then re-throw so BullMQ
records the failure correctly.

### 4.5 — Error codes to add to `@shortstory/shared` if needed

`VIDEO_NOT_FOUND` and `METADATA_UNAVAILABLE` are already in `JobErrorCode`.
No shared-package changes expected unless a new error surface is discovered.

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
  config/index.ts         Zod env validation (REDIS_URL required in prod)
  lib/logger.ts           Pino singleton
  lib/redis.ts            ioredis singleton (getRedis) + bullMQConnection options
  lib/jobStore.ts         saveJob / getJob / updateJob (Redis JSON, 24h TTL)
  types/errors.ts         AppError — factories: badRequest, notFound, invalidUrl,
                          videoTooLong, internal
  middleware/             requestId, requestLogger, errorHandler
  routes/health.ts        GET /health (Node uptime + Redis ping)
  queues/cardQueue.ts     BullMQ Queue<CardJobData>
  workers/cardWorker.ts   BullMQ Worker; TODO(phase-4) stub in processCard
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
