# Project Memory

Persistent facts about this project. Updated at the end of each phase.
Each entry states the fact, why it matters, and what it implies for future work.

---

## Product

**ShortStory** generates a branded Instagram Story attribution card from a
YouTube Short URL. It does **not** download or redistribute the source video
(Model B / Attribution Card). The card is 1080×1920, credits are burned in with
ffmpeg, and a tappable link sticker points back to the original Short.

Full compliance rationale: `docs/compliance.md`.

---

## Architecture invariants

- `yt-dlp` and any video-stream download is permanently excluded. If you see it
  appear as a dependency, remove it immediately.
- All error codes the mobile client handles must live in `JobErrorCode` in
  `packages/shared/src/job.ts`, not as local backend strings.
- `@shortstory/shared` must be rebuilt (`npm run build:shared`) before
  typechecking `@shortstory/backend` — the backend imports from compiled dist.
- The monorepo uses **npm workspaces** (not pnpm, not yarn). Package resolution
  goes through the root `node_modules`.
- Everything is **ESM** (`"type": "module"`) with `module: NodeNext` in tsconfig.
  CJS interop via `esModuleInterop: true`. Import paths require `.js` extensions.

---

## Tech decisions

| Decision | Choice | Reason |
|---|---|---|
| Deployment | Single Docker server | ffmpeg / BullMQ worker don't fit serverless |
| Module system | ESM / NodeNext | Repo-wide consistency; no CJS islands |
| Request logger | Custom pino middleware | pino-http's CJS default breaks NodeNext (ADR-003) |
| Error envelope | `ApiErrorResponse` from shared | Mobile types all errors without backend knowledge |
| Env validation | Zod at startup | Fast-fail; readable error on misconfiguration |
| UUID library | uuid v11+ | v10 has moderate CVE GHSA-w5hq-g745-h8pq |
| PID 1 in Docker | dumb-init | Node ignores SIGTERM as PID 1 without it |
| Body limit | 16 KB | Blocks payload-inflation attacks |
| ioredis import | `import { Redis } from 'ioredis'` (named) | Default import resolves as namespace under NodeNext; named export works correctly (ADR-007) |
| BullMQ connection | `{ url: REDIS_URL }` options object | BullMQ creates its own connections with the correct blocking-command settings; no shared client needed (ADR-007) |
| Rate-limit store | `rate-limit-redis@4` (not v5) | v5 requires express-rate-limit ≥ 8.5; we use v7. Pinned at v4 (ADR-007) |
| Job persistence | JSON string at `job:{id}`, 24h TTL | Simpler than Redis hashes for nested types; avoids serialization of optional fields (ADR-007) |
| HTTPS proxy | Caddy (not nginx) | Auto-provisions Let's Encrypt certs; zero renewal management (ADR-008) |
| Container registry | ghcr.io | Free with GitHub Actions; uses GITHUB_TOKEN; private by default (ADR-008) |
| Env isolation | `docker compose --project-name` | Namespaces all Docker resources; simpler than separate VMs at current scale (ADR-008) |

---

## Completed phases

| Phase | Summary |
|---|---|
| 1 | Monorepo scaffold; `@shortstory/shared` fully typed (DTOs, job state machine, constants) |
| 2 | Express foundation: config, logging, errors, middleware, health route, Dockerfile, docker-compose |
| 3 | Redis (ioredis singleton, job store, Redis rate-limit store), BullMQ queue + worker stub, health Redis ping |
| 4 | YouTube Data API v3 integration: URL extractor, metadata client (videos.list + channels.list), worker stub replaced with real fetch |
| 5 | ffmpeg card pipeline: thumbnail downloader, 1080×1920 JPEG renderer with drawtext overlays, bundled Inter fonts, Dockerfile updated to include assets/ |
| 6 | REST API (POST /api/v1/jobs, GET /api/v1/jobs/:id) + S3 upload (AWS SDK v3, pre-signed URL, production config guards) |
| 7 | Mobile foundation: Expo SDK 51 scaffold, API client (native fetch, EXPO_PUBLIC_API_URL), useJobPoller hook, three-screen React Navigation stack (Home → Processing → Result) |
| 8 | Share extension: iOS ShareViewController (validates YouTube Short, fires shortstory://share?url=…), Android intent filters (VIEW + SEND), deep-link handoff via Linking listener + HomeScreen cold/warm-start handling |
| 9 | Instagram Story sharing: expo-file-system download of pre-signed card URL, instagram-stories://share deep link, Instagram install check, spinner UX, temp-file cleanup |
| 10 | Production deployment: Docker Compose resource limits + Caddy HTTPS reverse proxy, GitHub Actions CI/CD (typecheck → Docker push → SSH deploy), staging runbook (`docs/staging.md`), MinIO dev profile |

---

## Known issues carried forward

_None. All known issues from prior phases resolved in Phase 10._

---

## File map (key files only)

```
packages/shared/src/
  job.ts          JobState, JobErrorCode (including RATE_LIMITED), Job, CardResult
  metadata.ts     VideoMetadata, MAX_VIDEO_DURATION_SECONDS (90s)
  api.ts          CreateJobRequest/Response, JobStatusResponse, ApiErrorResponse
  index.ts        re-exports everything

apps/backend/src/
  config/index.ts         Zod env validation (REDIS_URL + YOUTUBE_API_KEY required in production)
  lib/logger.ts           Pino singleton
  lib/redis.ts            ioredis singleton (getRedis) + bullMQConnection options
  lib/jobStore.ts         saveJob / getJob / updateJob (Redis JSON, 24h TTL)
  lib/youtubeUrl.ts       extractVideoId() — Shorts/youtu.be/watch URL → 11-char ID or null
  lib/youtubeClient.ts    fetchVideoMetadata() — YouTube Data API v3 (videos.list + channels.list)
  lib/thumbnail.ts        downloadThumbnail() — fetch to tmp file, returns path
  lib/cardRenderer.ts     renderCard() — ffmpeg 1080×1920 JPEG with Inter font overlays
  lib/s3Uploader.ts       uploadCard() — PutObject to S3, pre-signed GET URL, deletes local file
  types/errors.ts         AppError with isOperational flag
  middleware/             requestId, requestLogger, errorHandler
  routes/health.ts        GET /health → { status, version, uptimeSeconds, timestamp, redis }
  routes/jobs.ts          POST /api/v1/jobs + GET /api/v1/jobs/:id
  queues/cardQueue.ts     BullMQ Queue<CardJobData>
  workers/cardWorker.ts   BullMQ Worker; full pipeline: metadata → thumbnail → render → S3 upload → completed
  app.ts                  Express factory; rate limiter uses RedisStore
  server.ts               Graceful shutdown (worker.close + closeRedis + 10s force-exit)

apps/backend/Dockerfile     Multi-stage; build context = repo root; ffmpeg pre-installed
docker-compose.yml          backend + redis:7-alpine with AOF and health-check ordering

apps/mobile/
  App.tsx                   NavigationContainer + native stack (Home → Processing → Result)
  app.json                  Expo slug, bundle IDs, portrait only
  metro.config.js           watchFolders + nodeModulesPaths for workspace resolution
  ios/ShareExtension/       ShareViewController.swift + Info.plist (add to Xcode after prebuild)
  src/navigation/types.ts   RootStackParamList (Home: { incomingUrl? } | undefined)
  src/lib/parseDeepLink.ts  parseShortStoryUrl(raw) → YouTube URL | null
  src/api/client.ts         createJob / getJobStatus — native fetch, EXPO_PUBLIC_API_URL
  src/hooks/useJobPoller.ts useJobPoller(jobId, pollIntervalMs) — stops on terminal state
  src/screens/             HomeScreen (deep-link pre-fill), ProcessingScreen, ResultScreen (Instagram share)
```
