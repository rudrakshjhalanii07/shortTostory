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

## Phase 4 — YouTube Data API integration ✅

**Completed:** Session 3

**Deliverables:**

| File | Purpose |
|---|---|
| `src/lib/youtubeUrl.ts` | Extract 11-char video ID from Shorts/youtu.be/watch URLs; returns null on mismatch |
| `src/lib/youtubeClient.ts` | `fetchVideoMetadata()` — two sequential YouTube Data API v3 calls (videos.list + channels.list) via native fetch; enforces 90s limit; populates all `VideoMetadata` fields |
| `src/config/index.ts` | `YOUTUBE_API_KEY` required in production (fast-fail on startup) |
| `src/workers/cardWorker.ts` | Stub replaced; extracts video ID, fetches metadata, persists to job store, advances progress to `downloading_thumbnail` |

**Verified:**
- `npm run build:shared && npm run typecheck --workspace @shortstory/backend` — 0 errors

**Known issues / carried forward:**
- Processor halts at `downloading_thumbnail` (33 %) — Phase 5 fills in thumbnail download and ffmpeg render.

---

## Phase 5 — ffmpeg card pipeline ✅

**Completed:** Session 3

**Deliverables:**

| File | Purpose |
|---|---|
| `src/lib/thumbnail.ts` | `downloadThumbnail()` — fetch thumbnail URL to temp file via native fetch |
| `src/lib/cardRenderer.ts` | `renderCard()` — ffmpeg 1080×1920 JPEG; dark bg, thumbnail inset, drawtext overlays for channel/handle/title/views/CTA |
| `apps/backend/assets/fonts/` | Inter Regular + Bold TTFs (Inter v4.0, SIL OFL license) — bundled for cross-platform consistency |
| `apps/backend/Dockerfile` | Production stage now copies `assets/` so fonts are available at runtime |
| `src/workers/cardWorker.ts` | Full pipeline wired: metadata → thumbnail download → render → progress at 33/66/90 % |

**Verified:**
- `npm run build:shared && npm run typecheck --workspace @shortstory/backend` — 0 errors

**Known issues / carried forward:**
- Card is rendered but immediately cleaned up (no upload target yet) — Phase 6 adds S3 upload.

---

## Phase 6 — REST API + S3 upload ✅

**Completed:** Session 4

**Deliverables:**

| File | Purpose |
|---|---|
| `src/routes/jobs.ts` | `POST /api/v1/jobs` (validate URL, create job, enqueue) + `GET /api/v1/jobs/:id` (poll status) |
| `src/lib/s3Uploader.ts` | `uploadCard()` — PutObject to S3, pre-signed GET URL, deletes local temp file on success |
| `src/config/index.ts` | S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY required in production |
| `src/lib/jobStore.ts` | `JobUpdate` now includes `result: CardResult` so worker can persist upload result |
| `src/workers/cardWorker.ts` | `uploadCard()` wired after render; `uploadDone` flag guards temp-file cleanup in finally |
| `src/app.ts` | Jobs router mounted at `API_BASE_PATH` |

**Verified:**
- `npm run build:shared && npm run typecheck --workspace @shortstory/backend` — 0 errors

**Known issues / carried forward:**
- S3 upload requires live credentials to test end-to-end; local dev uses MinIO via `S3_ENDPOINT`.

---

## Phase 7 — Mobile foundation ✅

**Completed:** Session 5

**Deliverables:**

| File | Purpose |
|---|---|
| `apps/mobile/package.json` | Expo SDK 51, React Navigation native-stack, `@shortstory/shared` dep |
| `apps/mobile/app.json` | Expo config (slug, bundle identifiers, portrait orientation) |
| `apps/mobile/tsconfig.json` | `moduleResolution: bundler`, `jsx: react-jsx`, paths for `@shortstory/shared` dist |
| `apps/mobile/babel.config.js` | `babel-preset-expo` |
| `apps/mobile/metro.config.js` | Monorepo watch + `nodeModulesPaths` for workspace resolution |
| `apps/mobile/App.tsx` | `NavigationContainer` + native stack (Home → Processing → Result) |
| `src/navigation/types.ts` | `RootStackParamList` — typed params for all three screens |
| `src/api/client.ts` | `createJob` + `getJobStatus` — native fetch, `EXPO_PUBLIC_API_URL`, typed via shared DTOs |
| `src/hooks/useJobPoller.ts` | `useJobPoller(jobId, pollIntervalMs)` — interval poll, stops on terminal states, clears on unmount |
| `src/screens/HomeScreen.tsx` | URL input + Generate button; calls `createJob`, navigates to Processing |
| `src/screens/ProcessingScreen.tsx` | Shows stage label + percent from `JobProgress`; uses `useJobPoller`; navigates to Result on complete |
| `src/screens/ResultScreen.tsx` | Displays card image from `downloadUrl`; disabled "Share to Story" button (Phase 9) |

**Verified:**
- `npm run build:shared && npx tsc --noEmit -p apps/mobile/tsconfig.json` — 0 errors
- `npm run typecheck --workspace @shortstory/backend` — 0 errors (no regressions)

---

## Phase 8 — Share extension ✅

**Completed:** Session 5

**Deliverables:**

| File | Purpose |
|---|---|
| `apps/mobile/ios/ShareExtension/ShareViewController.swift` | Share extension UI controller — reads URL from `NSExtensionItem`, validates it's a YouTube Short, opens `shortstory://share?url=…` via `extensionContext?.open` |
| `apps/mobile/ios/ShareExtension/Info.plist` | `NSExtensionActivationSupportsWebURLWithMaxCount: 1` — extension only appears for web URLs |
| `apps/mobile/app.json` | `scheme: "shortstory"` (iOS + Android custom URL scheme); `ios.infoPlist.LSApplicationQueriesSchemes`; Android `intentFilters` for `VIEW shortstory://share`, `VIEW youtube.com/shorts` + `youtu.be`, `SEND text/plain` |
| `apps/mobile/src/lib/parseDeepLink.ts` | `parseShortStoryUrl(raw)` — extracts YouTube URL from `shortstory://share?url=…` |
| `apps/mobile/App.tsx` | `Linking.addEventListener` (warm start) — parses incoming URL, navigates to `HomeScreen` with `incomingUrl` param |
| `apps/mobile/src/navigation/types.ts` | `Home` param updated to `{ incomingUrl?: string } \| undefined` |
| `apps/mobile/src/screens/HomeScreen.tsx` | `route.params?.incomingUrl` (warm start) + `Linking.getInitialURL()` (cold start) pre-fill the URL field |

**iOS setup note (after `expo prebuild`):**
1. Add a "Share Extension" target in Xcode named `ShareExtension`.
2. Replace generated `ShareViewController.swift` / `Info.plist` with the checked-in files.
3. Deployment target: iOS 16.0+. No App Group needed.

**Verified:**
- `npm run build:shared && npx tsc --noEmit -p apps/mobile/tsconfig.json` — 0 errors

---

## Phase 9 — Instagram story sharing ✅

**Completed:** Session 6

**Deliverables:**

| File | Purpose |
|---|---|
| `apps/mobile/package.json` | Added `expo-file-system ~17.0.1` |
| `apps/mobile/src/navigation/types.ts` | `Result` params extended with `attributionLinkUrl: string` |
| `apps/mobile/src/screens/ProcessingScreen.tsx` | Passes `attributionLinkUrl` from `CardResult` when navigating to Result |
| `apps/mobile/src/screens/ResultScreen.tsx` | Real "Share to Story" handler: checks Instagram install, downloads card via `FileSystem.downloadAsync`, opens `instagram-stories://share?backgroundImage=…&contentURL=…`, cleans up temp file |

**Verified:**
- `npm run typecheck --workspace @shortstory/mobile` — 0 errors

---

## Phase 10 — Production deployment ✅

**Completed:** Session 7

**Deliverables:**

| File | Purpose |
|---|---|
| `docker-compose.yml` | Resource limits (`deploy.resources`) for backend and Redis; backend port bound to `127.0.0.1`; Caddy service for HTTPS; MinIO under `--profile dev` |
| `Caddyfile` | Caddy reverse-proxy config; auto-TLS from Let's Encrypt for `{$DOMAIN}` |
| `.github/workflows/ci.yml` | Typecheck (shared → backend → mobile) on every PR/push; Docker build+push to ghcr.io on main; optional SSH deploy job |
| `docs/staging.md` | Runbook for staging alongside production using `docker compose --project-name`; MinIO bucket setup for local dev |
| `docs/decisions.md` | ADR-008 (Caddy, GHCR, project-name isolation, MinIO dev profile) |

**Verified:**
- `docker-compose.yml` parses correctly
- CI workflow passes lint/syntax

**Decisions:** ADR-008
