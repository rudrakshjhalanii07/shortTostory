# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 7 — Mobile foundation  
**Next phase:** Phase 8 — Share extension (iOS share extension + Android intent filter)

Both `@shortstory/shared`, `@shortstory/backend`, and `@shortstory/mobile`
typecheck clean with 0 errors. The repo is committed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).

---

## What was just completed (Phase 7)

### 7A — Expo project scaffold

`apps/mobile/` is now a full Expo SDK 51 project (React Native 0.74). Key
config files:

- `package.json` — Expo SDK 51, React Navigation native-stack,
  `@shortstory/shared: "*"` workspace dep, `main: node_modules/expo/AppEntry.js`
- `app.json` — Expo slug `shortstory`, portrait orientation, iOS bundle ID
  `com.shortstory.app`
- `tsconfig.json` — `moduleResolution: bundler`, `jsx: react-jsx`, `paths`
  pointing `@shortstory/shared` at the compiled dist for type checking
- `babel.config.js` — `babel-preset-expo`
- `metro.config.js` — `watchFolders: [monorepoRoot]`,
  `nodeModulesPaths: [appRoot/node_modules, monorepoRoot/node_modules]`

### 7B — API client (`src/api/client.ts`)

Typed wrapper over native `fetch`:

- `BASE_URL` reads `process.env.EXPO_PUBLIC_API_URL` (fallback: `http://localhost:3000`).
- `createJob(url)` → `POST /api/v1/jobs` → `CreateJobResponse`
- `getJobStatus(jobId)` → `GET /api/v1/jobs/:id` → `JobStatusResponse`
- Non-2xx: parses `ApiErrorResponse.error.message`, throws `Error`.

### 7C — Polling hook (`src/hooks/useJobPoller.ts`)

```ts
useJobPoller(jobId: string | null, pollIntervalMs = 2000)
  → { status: JobStatusResponse | null; error: string | null }
```

- Fires an immediate poll on mount, then every `pollIntervalMs` ms.
- Stops (clears interval) when `state === 'completed' | 'failed'`.
- Also stops on network errors, surfacing them via `error`.
- Cleans up on unmount.

### 7D — Three-screen UI

React Navigation native-stack (`NavigationContainer` in `App.tsx`):

| Screen | Route params | Behaviour |
|---|---|---|
| `HomeScreen` | — | TextInput + Generate button; calls `createJob`; navigates to `Processing` |
| `ProcessingScreen` | `{ jobId, pollIntervalMs }` | `useJobPoller`; shows `JobProgress.stage` (human label) + percent; `replace('Result')` on complete; shows error on fail. Back gesture disabled. |
| `ResultScreen` | `{ downloadUrl }` | `Image` from signed URL; disabled "Share to Story" button (Phase 9) |

---

## Immediate next steps (Phase 8)

Phase 8 wires up the iOS share extension and Android intent filter so users can
send a YouTube Short directly from the native share sheet.

### 8A — iOS share extension

- `apps/mobile/ios/ShareExtension/` — Xcode target with `NSExtension` pointing
  at `ShareViewController.swift`.
- The extension reads the incoming URL from `NSExtensionItem`, validates it is a
  YouTube Short, then opens the main app via a custom URL scheme
  (`shortstory://share?url=…`).
- `app.json` — add `ios.infoPlist.LSApplicationQueriesSchemes` and the custom
  URL scheme under `ios.associatedDomains` if needed.

### 8B — Android intent filter

- `app.json` — add an `intentFilters` entry under `android` so the main app
  appears in the "Share" sheet for `text/plain` and YouTube URLs.
- The `HomeScreen` reads the initial URL from `Linking.getInitialURL()` and
  pre-fills the field.

### 8C — Deep-link handoff

- Add a `Linking` listener in the root `App.tsx` to catch `shortstory://share?url=…`
  while the app is already running.
- On receipt, navigate programmatically to `HomeScreen` with the URL pre-filled
  (or trigger `createJob` directly if UX calls for it).

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
  App.tsx             NavigationContainer + native stack (Home → Processing → Result)
  app.json            Expo config
  metro.config.js     Monorepo watch folders + nodeModulesPaths
  src/
    navigation/types.ts     RootStackParamList
    api/client.ts           createJob, getJobStatus (native fetch, EXPO_PUBLIC_API_URL)
    hooks/useJobPoller.ts   useJobPoller(jobId, pollIntervalMs) → { status, error }
    screens/HomeScreen.tsx
    screens/ProcessingScreen.tsx
    screens/ResultScreen.tsx

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

# Mobile (from apps/mobile/ or via workspace):
cd apps/mobile && npx expo start             # Expo Go / simulator
```

**Git:**
```
remote: https://github.com/rudrakshjhalanii07/shortTostory
branch: main
```
