# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 9 — Instagram Story sharing  
**Next phase:** Phase 10 — Production deployment

All three packages (`@shortstory/shared`, `@shortstory/backend`, `@shortstory/mobile`)
typecheck clean with 0 errors. The repo is committed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).

---

## What was just completed (Phase 9)

### 9A — Download the signed card

`ResultScreen` uses `expo-file-system` (`FileSystem.downloadAsync`) to fetch
`CardResult.downloadUrl` (a pre-signed S3 URL) into a temp file at
`FileSystem.cacheDirectory + 'card_<timestamp>.jpg'` before opening Instagram.

### 9B — Instagram story composer

The handler opens:
```
instagram-stories://share
  ?backgroundImage=<encodeURIComponent(localPath)>
  &contentURL=<encodeURIComponent(attributionLinkUrl)>
```
`Linking.canOpenURL('instagram://app')` is checked first; if Instagram is not
installed the user sees a friendly `Alert` and the flow is aborted before the
download starts.

### 9C — ResultScreen wired

`ResultScreen` now:
1. Checks Instagram availability before doing any work.
2. Shows an `ActivityIndicator` on the button while downloading.
3. Calls `FileSystem.downloadAsync`, then `Linking.openURL`.
4. Always calls `FileSystem.deleteAsync(..., { idempotent: true })` in the
   `finally` block to clean up the local file.
5. Shows an `Alert` on any caught error.

**Navigation type change:** `Result` params extended with
`attributionLinkUrl: string`. `ProcessingScreen` now passes
`status.result.attributionLinkUrl` alongside `downloadUrl` when navigating.

---

## Immediate next steps (Phase 10)

Phase 10 hardens the deployment for production.

### 10A — Docker Compose hardening

- Add `restart: unless-stopped` to both services.
- Add `mem_limit` / `cpus` resource caps to the backend service.
- Ensure Redis uses an explicit named volume for AOF persistence.

### 10B — HTTPS reverse proxy

Add an nginx (or Caddy) service to `docker-compose.yml` that terminates TLS
and reverse-proxies to the Express backend. The backend should bind only to
`127.0.0.1` inside the Compose network.

### 10C — CI/CD pipeline

A GitHub Actions workflow that:
1. Builds `@shortstory/shared` and runs `tsc --noEmit` for both backend and mobile.
2. Builds the Docker image and pushes it to a registry on merges to `main`.
3. (Optional) Deploys to a VPS via SSH + `docker compose pull && docker compose up -d`.

### 10D — Environment separation

Document (or script) how to run a staging stack alongside production, with
separate Redis and S3 bucket/prefix, using Docker Compose `--project-name`.

### 10E — MinIO local dev

Add a `minio` service to `docker-compose.yml` (gated by a `--profile dev`
profile) so the full S3 upload pipeline can be exercised without live AWS
credentials.

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
    lib/jobStore.ts         saveJob / getJob / updateJob (Redis JSON, 24h TTL)
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

apps/mobile/
  App.tsx             NavigationContainer + Linking warm-start listener + native stack
  app.json            scheme: "shortstory"; iOS LSApplicationQueriesSchemes; Android intentFilters
  metro.config.js     Monorepo watch folders + nodeModulesPaths
  ios/ShareExtension/
    ShareViewController.swift   Reads URL → validates YouTube Short → opens shortstory://share?url=…
    Info.plist                  NSExtensionActivationSupportsWebURLWithMaxCount: 1
  src/
    navigation/types.ts     RootStackParamList (Home accepts optional incomingUrl)
    lib/parseDeepLink.ts    parseShortStoryUrl(raw) → YouTube URL | null
    api/client.ts           createJob, getJobStatus (native fetch, EXPO_PUBLIC_API_URL)
    hooks/useJobPoller.ts   useJobPoller(jobId, pollIntervalMs) → { status, error }
    screens/HomeScreen.tsx  Cold-start (Linking.getInitialURL) + warm-start (route.params)
    screens/ProcessingScreen.tsx
    screens/ResultScreen.tsx   "Share to Story" placeholder (Phase 9)

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

# Mobile:
cd apps/mobile && npx expo start             # Expo Go / simulator
# Deep-link test (simulator):
xcrun simctl openurl booted "shortstory://share?url=https%3A%2F%2Fwww.youtube.com%2Fshorts%2FdQw4w9WgXcQ"
```

**Git:**
```
remote: https://github.com/rudrakshjhalanii07/shortTostory
branch: main
```
