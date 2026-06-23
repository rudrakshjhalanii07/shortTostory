# Session Handoff

> Rewritten at the end of every phase. Always reflects the state the repo was
> left in — not the state it was started in.

---

## Where we are

**Last completed phase:** Phase 8 — Share extension  
**Next phase:** Phase 9 — Instagram Story sharing

Both `@shortstory/shared`, `@shortstory/backend`, and `@shortstory/mobile`
typecheck clean with 0 errors. The repo is committed to
`https://github.com/rudrakshjhalanii07/shortTostory` (private, main branch).

---

## What was just completed (Phase 8)

### 8A — iOS share extension

`apps/mobile/ios/ShareExtension/` contains two files that are added to the
Xcode project after `expo prebuild`:

**`ShareViewController.swift`**
- Subclasses `UIViewController`; invoked when user taps ShortStory in the iOS
  share sheet.
- Reads `NSExtensionItem.attachments[0]` as `UTType.url`.
- Validates the URL contains `youtube.com/shorts/` or `youtu.be/`.
- Constructs `shortstory://share?url=<encoded YouTube URL>` and fires it via
  `extensionContext?.open(_:completionHandler:)`.
- Always calls `extensionContext?.completeRequest` to dismiss cleanly.

**`Info.plist`**
- `NSExtensionPointIdentifier: com.apple.share-services`
- `NSExtensionActivationSupportsWebURLWithMaxCount: 1` — only activates for
  single web-URL shares, not plain text or photos.

**Setup after `expo prebuild`:**
1. Add a "Share Extension" Xcode target named `ShareExtension`.
2. Swap in the checked-in `ShareViewController.swift` and `Info.plist`.
3. Set deployment target to iOS 16.0+. No App Group required.

### 8B — Android intent filter

Three filters added to `app.json` under `android.intentFilters`:
1. `ACTION_VIEW` `shortstory://share` — the deep-link scheme itself
2. `ACTION_VIEW` `https://www.youtube.com/shorts/*` + `https://youtu.be/*` —
   ShortStory appears in the share sheet when the user taps "Share" on a
   YouTube Short in Chrome/YouTube app
3. `ACTION_SEND` `text/plain` — generic text share (covers other URL-copy flows)

`"scheme": "shortstory"` added at the top level of the Expo config so both
platforms register the custom URL scheme.

`ios.infoPlist.LSApplicationQueriesSchemes` lists `youtube` and
`youtube-x-callback` so the app can check for the YouTube app if needed later.

### 8C — Deep-link handoff

**`src/lib/parseDeepLink.ts`** — `parseShortStoryUrl(raw: string): string | null`  
Parses `shortstory://share?url=…` and returns the decoded YouTube URL, or null
for any other input.

**`App.tsx`** — warm-start listener  
`createNavigationContainerRef` + `Linking.addEventListener('url', …)` catches
incoming deep links while the app is already running. Calls
`navigationRef.navigate('Home', { incomingUrl })`.

**`src/screens/HomeScreen.tsx`** — cold-start + param handling  
- `route.params?.incomingUrl` — set by the warm-start navigate; pre-fills the
  text field via `useEffect`.
- `Linking.getInitialURL()` — if the app was killed and launched directly by the
  share extension, the URL comes in here; piped through `parseShortStoryUrl`.

**`src/navigation/types.ts`** — `Home` route updated to
`{ incomingUrl?: string } | undefined`.

---

## Immediate next steps (Phase 9)

Phase 9 wires the "Share to Story" button in `ResultScreen` to Instagram's
native story composer.

### 9A — Download the signed card

The `CardResult.downloadUrl` is a pre-signed S3 URL valid for 1 hour. Before
handing the card to Instagram, download it to the device's local filesystem
using `expo-file-system` (`FileSystem.downloadAsync`).

### 9B — Instagram story composer

Instagram exposes the `instagram-stories://share` URL scheme:

```
instagram-stories://share?
  backgroundImage=<file URI>&
  backgroundTopColor=%23ffffff&
  backgroundBottomColor=%23000000&
  stickerImage=<optional overlay>&
  contentURL=<attribution link>
```

Pipe the downloaded card path as `backgroundImage`. Set `contentURL` to
`CardResult.attributionLinkUrl` (the original Short URL) so Instagram attaches
the link sticker automatically.

Check `Linking.canOpenURL('instagram://app')` before opening; show a friendly
message if Instagram is not installed.

### 9C — Wire up ResultScreen

Replace the disabled "Share to Story" button with a real handler:
1. Show a loading spinner while downloading.
2. Call `FileSystem.downloadAsync(downloadUrl, localPath)`.
3. Open `instagram-stories://share?...`.
4. Clean up the local file after the deep link fires.

Add `expo-file-system` to `apps/mobile/package.json`.

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
