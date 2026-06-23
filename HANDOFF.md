# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 3 — Redis & BullMQ  
**Next phase:** Phase 4 — YouTube Data API integration

Both `@shortstory/shared` and `@shortstory/backend` typecheck clean with 0
errors. Docker and docker-compose are wired but the image has not yet been
built or tested end-to-end (Docker build is Phase 10 hardening).

---

## What was just completed (Phase 3)

- **`ioredis` client** (`src/lib/redis.ts`): Singleton with exponential
  reconnect strategy. `getRedis()` returns the shared instance; `closeRedis()`
  is called on graceful shutdown. `bullMQConnection = { url: REDIS_URL }` is
  the connection options object passed to BullMQ (BullMQ manages its own
  ioredis connections internally).

- **Job store** (`src/lib/jobStore.ts`): `saveJob` / `getJob` / `updateJob`
  persist `Job` records as JSON strings under `job:{id}` with a 24-hour TTL.
  `updateJob` merges a partial `JobUpdate` onto the stored record.

- **BullMQ Queue** (`src/queues/cardQueue.ts`): `cardQueue` — 3 attempts,
  exponential backoff, 100-entry rolling retention for completed and failed
  jobs.

- **BullMQ Worker** (`src/workers/cardWorker.ts`): `createCardWorker()` returns
  a worker with concurrency 2. Stub processor logs the job and returns. Event
  handlers on `active` / `completed` / `failed` advance the stored `Job` state
  machine. Phases 4–6 fill in the real logic.

- **Config tightening** (`src/config/index.ts`): `REDIS_URL` is now required
  in production — process exits with a readable error if it's absent.

- **Redis-backed rate limiter** (`src/app.ts`): `express-rate-limit`'s
  in-memory store replaced with `RedisStore` from `rate-limit-redis@4`.
  `ioredis.call()` is accessed via a type-cast because ioredis exposes it at
  runtime but omits it from its public `.d.ts` declarations.

- **Health endpoint** (`src/routes/health.ts`): `GET /health` now PINGs Redis
  and includes `{ redis: "ok" | "error" }`. Returns `status: "degraded"` if
  the ping fails.

- **Graceful shutdown** (`src/server.ts`): Worker is started at boot.
  Shutdown sequence: `server.close()` → `worker.close()` → `closeRedis()`.

---

## Immediate next steps (Phase 4)

Phase 4 must deliver:

1. **YouTube Data API v3 client** — thin wrapper around the YouTube API, typed
   with the `VideoMetadata` shape from `@shortstory/shared`. Inject
   `YOUTUBE_API_KEY` from config (already in the Zod schema as optional;
   tighten it to required for production).

2. **Video ID extractor** — parse Short URLs in all forms:
   - `https://youtube.com/shorts/{id}`
   - `https://youtu.be/{id}` (watch redirect)
   - Reject anything that doesn't resolve to a Shorts video.

3. **Metadata fetcher** — call the YouTube `videos.list` endpoint with
   `part=snippet,contentDetails`; map the response to `VideoMetadata`.
   Enforce the 90-second limit (`MAX_VIDEO_DURATION_SECONDS` from shared).
   Throw `AppError.videoTooLong()` if exceeded. Throw `AppError.notFound()`
   if the video ID returns no result.

4. **Wire into the worker stub** — replace the Phase 3 `// TODO(phase-4)` in
   `cardWorker.ts` with the actual metadata fetch. Update job progress to
   `fetching_metadata` before and `downloading_thumbnail` after.

---

## Critical constraints — never violate

- **No `yt-dlp` or any video-stream download.** See ADR-001 and
  [docs/compliance.md](docs/compliance.md). If any dependency pulls it in
  transitively, remove it.
- **All error codes that the mobile client handles explicitly must live in
  `JobErrorCode` in `@shortstory/shared`**, not as local string literals in the
  backend (ADR-004).
- **Rebuild `@shortstory/shared` before typechecking `@shortstory/backend`.**
  The backend imports from the compiled `dist/` — stale dist = false clean.

---

## Repo quick-reference

```
packages/shared/src/      Shared TypeScript contract (types, DTOs, constants)
apps/backend/src/
  config/index.ts         Zod env validation (REDIS_URL required in production)
  lib/logger.ts           Pino singleton
  lib/redis.ts            ioredis singleton + bullMQConnection options
  lib/jobStore.ts         Redis-backed Job persistence (24h TTL)
  types/errors.ts         AppError
  middleware/             requestId, requestLogger, errorHandler
  routes/health.ts        GET /health (includes Redis ping)
  queues/cardQueue.ts     BullMQ Queue<CardJobData>
  workers/cardWorker.ts   BullMQ Worker stub (state machine wired)
  app.ts                  Express factory (Redis rate-limit store)
  server.ts               Entry point + graceful shutdown
apps/backend/Dockerfile   Multi-stage; build context = repo root
docker-compose.yml        backend + Redis
docs/
  architecture.md         System design + middleware stack
  compliance.md           Why no video download (read before touching ingestion)
  decisions.md            All ADRs
  progress.md             Phase checklist + deliverables
```

**Dev workflow:**
```bash
npm run build:shared                        # required before backend typecheck
npm run typecheck --workspace @shortstory/backend
npm run dev --workspace @shortstory/backend # tsx watch, hot-reload
```
