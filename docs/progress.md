# Build Progress

Tracks phase completion, deliverables, and known issues carried forward.

---

## Phase 1 — Architecture & repo structure ✅

**Completed:** Session 1

**Deliverables:**
- Monorepo scaffold: `apps/backend`, `apps/mobile`, `packages/shared`
- `packages/shared` fully authored and built:
  - `VideoMetadata` — YouTube API v3 fields, typed
  - `Job`, `JobState`, `JobStage`, `JobProgress`, `CardResult`, `JobError`, `JobErrorCode`
  - `CreateJobRequest`, `CreateJobResponse`, `JobStatusResponse`, `ApiErrorResponse`
  - `toJobStatusResponse()` helper
  - `API_BASE_PATH`, `MAX_VIDEO_DURATION_SECONDS` constants
- `tsconfig.base.json` — strict, NodeNext, ES2022
- Root `package.json` with npm workspaces
- `docs/architecture.md`, `docs/compliance.md`, `README.md`

**Decisions:** ADR-001 (Model B), ADR-002 (single Docker)

---

## Phase 2 — Backend foundation ✅

**Completed:** Session 1

**Deliverables:**

| File | Purpose |
|---|---|
| `apps/backend/package.json` | Real deps (express, pino, zod, helmet, cors, rate-limit, uuid) |
| `apps/backend/tsconfig.json` | Extends base; src → dist |
| `apps/backend/.env.example` | Full variable reference for all phases |
| `apps/backend/.gitignore` | Excludes dist/, .env, logs |
| `src/config/index.ts` | Zod env validation; fast-fail on startup |
| `src/lib/logger.ts` | Pino; pretty in dev, JSON in prod |
| `src/types/errors.ts` | `AppError` with static factories and `isOperational` flag |
| `src/middleware/requestId.ts` | UUID per request; `X-Request-Id` header; Express namespace augmentation |
| `src/middleware/requestLogger.ts` | Custom pino-backed request logger (replaces pino-http) |
| `src/middleware/errorHandler.ts` | Collapses all throws → `ApiErrorResponse` |
| `src/routes/health.ts` | `GET /health` liveness probe |
| `src/app.ts` | Express app factory; full middleware stack |
| `src/server.ts` | Entry point; SIGTERM/SIGINT graceful drain; uncaught handler |
| `apps/backend/Dockerfile` | Multi-stage; ffmpeg + dumb-init pre-installed |
| `docker-compose.yml` | Backend + Redis; health-check ordering |
| `.dockerignore` | Excludes node_modules, mobile app, dist from build context |

**Verified:**
- `npm run typecheck` — 0 errors (both `@shortstory/shared` and `@shortstory/backend`)
- Dev server starts; `GET /health` returns `{ status: "ok" }`; 404 returns typed `ApiErrorResponse` with request UUID
- 0 npm audit vulnerabilities

**Decisions:** ADR-003 (custom logger), ADR-004 (RATE_LIMITED in shared), ADR-005 (uuid v11, dumb-init, 16 KB cap), ADR-006 (ffmpeg in Phase 2 Dockerfile)

**Known issues / carried forward:**
- Rate-limit store is in-memory. Phase 3 must migrate it to a Redis-backed store so limits survive restarts and work across replicas.
- `GET /health` only checks Node process uptime. Phase 3 extends it to ping Redis.

---

## Phase 3 — Redis & BullMQ ✅

**Completed:** Session 2

**Deliverables:**

| File | Purpose |
|---|---|
| `src/lib/redis.ts` | ioredis singleton with reconnect strategy; `bullMQConnection` options for BullMQ |
| `src/lib/jobStore.ts` | `saveJob`, `getJob`, `updateJob` — persist `Job` records as JSON in Redis (24h TTL) |
| `src/queues/cardQueue.ts` | BullMQ `Queue<CardJobData>` — 3 attempts, exponential backoff |
| `src/workers/cardWorker.ts` | BullMQ `Worker` stub; advances job state (`queued → processing → completed/failed`) |
| `src/config/index.ts` | `REDIS_URL` required in production (process exits if absent) |
| `src/routes/health.ts` | `/health` extended with `redis: "ok" | "error"` via PING check |
| `src/app.ts` | Rate limiter migrated from memory store to `RedisStore` (rate-limit-redis v4) |
| `src/server.ts` | Worker started at boot; `worker.close()` + `closeRedis()` on graceful shutdown |

**Verified:**
- `npm run typecheck` — 0 errors (both `@shortstory/shared` and `@shortstory/backend`)
- Dev server starts; code compiles and loads correctly

**Decisions:** (none new — decisions table in `PROJECT_MEMORY.md` and ADRs cover all choices)

---

## Phase 4 — YouTube Data API integration ⬜

**Target deliverables:**
- YouTube Data API v3 client
- `VideoMetadata` fetcher (validates Short, enforces 90s limit)
- URL parser / video-ID extractor

---

## Phase 5 — ffmpeg card pipeline ⬜

**Target deliverables:**
- Thumbnail downloader
- ffmpeg card renderer (1080×1920, credits burned in)
- S3 upload + signed URL generation
- Card template system

---

## Phase 6 — REST API ⬜

**Target deliverables:**
- `POST /api/v1/jobs` — validate, enqueue, return job ID
- `GET /api/v1/jobs/:id` — poll job status
- Input validation (Zod schemas for request bodies)
- Full integration with BullMQ worker

---

## Phase 7 — Mobile foundation ⬜

**Target deliverables:**
- Expo project setup
- API client using `@shortstory/shared` types
- Job polling logic
- Basic UI scaffolding

---

## Phase 8 — Share extension ⬜

**Target deliverables:**
- iOS share extension receiving YouTube URLs
- Android intent filter
- Deep-link handoff to main app

---

## Phase 9 — Instagram story sharing ⬜

**Target deliverables:**
- `instagram-stories://` deep link integration
- Video download from signed URL
- Story composer pre-load

---

## Phase 10 — Production deployment ⬜

**Target deliverables:**
- Docker Compose hardening (resource limits, restart policies)
- HTTPS reverse proxy (nginx / Caddy)
- CI/CD pipeline
- Environment separation (staging / prod)
- Monitoring / alerting
