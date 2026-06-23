# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 10 — Production deployment  
**Next phase:** None planned (all phases complete)

All three packages (`@shortstory/shared`, `@shortstory/backend`, `@shortstory/mobile`)
typecheck clean with 0 errors. The repo is committed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).

---

## What was just completed (Phase 10)

### 10A — Docker Compose hardening

`docker-compose.yml` updated:
- `deploy.resources.limits` added to both `backend` (1 CPU / 512 MB) and
  `redis` (0.5 CPU / 320 MB).
- Backend `ports:` changed to `127.0.0.1:3000:3000` so the port is not
  reachable from external IPs on the host.
- All services already had `restart: unless-stopped` and the Redis named
  volume (`redis_data:/data`) from prior phases.

### 10B — HTTPS reverse proxy

A new `caddy:2-alpine` service was added to `docker-compose.yml`:
- Exposes ports 80, 443 (TCP + UDP for HTTP/3).
- Mounts `./Caddyfile` read-only.
- Uses `caddy_data` and `caddy_config` named volumes for certificate storage.
- `backend` no longer needs to be reached from outside the Compose network —
  Caddy proxies to `backend:3000` internally.

`Caddyfile` at repo root:
```
{$DOMAIN} {
    reverse_proxy backend:3000
}
```
Set `DOMAIN=api.yourdomain.com` in the environment before starting. Caddy
auto-provisions a Let's Encrypt certificate. For local testing without a
domain, replace `{$DOMAIN}` with `:80`.

### 10C — CI/CD pipeline

`.github/workflows/ci.yml` added with three jobs:

| Job | Trigger | What it does |
|---|---|---|
| `typecheck` | Every push / PR to `main` | `npm ci` → `build:shared` → typecheck backend + mobile |
| `docker` | Push to `main` only | Builds image, pushes `latest` + `<sha>` to `ghcr.io/<repo>` |
| `deploy` | After `docker` succeeds | SSH to server; `docker compose pull && up -d` (requires `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` secrets) |

The `deploy` job uses the `production` GitHub environment — configure
protection rules there if needed.

### 10D — Environment separation

`docs/staging.md` documents:
- How to run staging alongside production with
  `docker compose --project-name shortstory-staging`.
- A minimal `docker-compose.staging.yml` override pattern.
- MinIO bucket creation commands for local dev.

### 10E — MinIO local dev

`minio/minio:latest` service added to `docker-compose.yml` under
`profiles: [dev]`:
- Not started by default — requires `docker compose --profile dev up`.
- API at `http://localhost:9000`, console at `http://localhost:9001`.
- Credentials: `minioadmin` / `minioadmin`.

`.env` settings for local dev:
```dotenv
S3_ENDPOINT=http://minio:9000
S3_BUCKET=shortstory-dev
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

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
    screens/ResultScreen.tsx   "Share to Story": checks Instagram, downloads card, opens deep link

docker-compose.yml    backend + redis + caddy (prod); minio (--profile dev)
Caddyfile             Caddy reverse-proxy; auto-TLS via DOMAIN env var
.github/workflows/ci.yml  Typecheck → Docker push → SSH deploy

docs/
  architecture.md         System design + middleware stack
  compliance.md           Why no video download (read before touching ingestion)
  decisions.md            ADR-001 through ADR-008
  progress.md             Phase checklist + deliverables
  staging.md              Staging / MinIO runbook
```

**Dev workflow:**
```bash
npm run build:shared                         # always run first
npm run typecheck --workspace @shortstory/backend
npm run dev --workspace @shortstory/backend  # tsx watch, hot-reload

# Local dev with MinIO:
docker compose --profile dev up -d

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
