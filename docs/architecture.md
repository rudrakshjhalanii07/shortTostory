# ShortStory Architecture

## One-paragraph summary

ShortStory turns a YouTube Short URL into a branded, Instagram-Story-formatted
**attribution card** and hands it to the Instagram Story composer. The mobile
app captures the URL from the native share sheet, submits it to the backend,
and polls for the rendered card. The backend fetches metadata from the official
YouTube Data API, renders a 1080×1920 card with ffmpeg (credits burned in),
stores it in S3, and returns a temporary signed URL. **No source video is ever
downloaded or redistributed** — see [compliance.md](./compliance.md).

## End-to-end flow

```
┌──────────────┐   1. Share Short URL    ┌─────────────────────┐
│  YouTube app │ ──────────────────────▶ │  ShortStory mobile  │
└──────────────┘   (native share sheet)  │  (Expo + share ext) │
                                         └──────────┬──────────┘
                              2. POST /api/v1/jobs  │
                                                    ▼
                                         ┌─────────────────────┐
                                         │  Express API (6)    │
                                         │  - validate URL     │
                                         │  - rate limit       │
                                         │  - enqueue job      │
                                         └──────────┬──────────┘
                                       3. add job   │
                                                    ▼
                                         ┌─────────────────────┐
                                         │  BullMQ + Redis (3) │
                                         └──────────┬──────────┘
                                       4. process   │
                                                    ▼
                                         ┌─────────────────────┐
                                         │  Render worker      │
                                         │  a. YouTube API (4) │  metadata + thumbnail
                                         │  b. ffmpeg (5)      │  burn credits → 9:16
                                         │  c. S3 upload       │  signed URL
                                         └──────────┬──────────┘
                              5. GET /jobs/:id      │
                                  (poll)            ▼
┌──────────────┐  7. open composer    ┌─────────────────────┐
│  Instagram   │ ◀─────────────────── │  ShortStory mobile  │
│  Story       │  instagram-stories://│  6. download card   │
└──────────────┘                      └─────────────────────┘
```

## Components & phases

| Component | Responsibility | Phase |
| --- | --- | --- |
| `packages/shared` | TypeScript contract (DTOs, job state, metadata) | 1 |
| `apps/backend` API | HTTP intake, validation, rate limit, job creation | 6 |
| Queue (BullMQ/Redis) | Durable job queue + status store | 3 |
| Render worker | Metadata fetch → ffmpeg card → S3 | 4, 5 |
| `apps/mobile` | Share capture, polling, download, IG handoff | 7–9 |
| Deployment | Docker, Redis, S3, HTTPS proxy | 10 |

## Key design principles

- **Async job model.** Rendering is offloaded to a BullMQ worker; the API stays
  fast and the device polls a simple state machine (`queued → processing →
  completed | failed`).
- **Shared contract.** Mobile and backend never hand-write the same type twice;
  both import `@shortstory/shared`.
- **Config from environment.** Every tunable lives in `.env` (see
  `.env.example`) — no hardcoded URLs, dimensions, keys, or limits.
- **Stateless API, stateful Redis.** API instances scale horizontally; Redis is
  the single coordination point for jobs and rate limits.
- **Ephemeral media.** Rendered cards live behind short-TTL signed URLs; the
  scratch space (`tmp/`) is never committed.

## Backend middleware stack (Phase 2)

Every inbound HTTP request passes through these layers in order:

```
helmet          → security headers (CSP, HSTS, X-Frame-Options …)
cors            → origin allow-list from CORS_ORIGINS env var
requestId       → attach UUID to req.id; echo as X-Request-Id header
requestLogger   → pino-backed structured log on response finish
rateLimit       → in-memory store (Phase 3 upgrades to Redis store)
express.json    → 16 KB body cap
─── routes ────
/health         → liveness probe
/api/v1/…       → job API (Phase 6)
─── 404 handler ─
errorHandler    → collapses AppError / unknown throws → ApiErrorResponse
```

All error responses conform to the shared `ApiErrorResponse` envelope:
```json
{ "error": { "code": "…", "message": "…", "requestId": "…" } }
```

## Configuration

All tunables are read from environment variables and validated at startup via
Zod. The process exits immediately if any required variable is missing or
malformed — no silent misconfiguration in production.

See [`apps/backend/.env.example`](../apps/backend/.env.example) for the full
variable reference.

## Open questions deferred to later phases

- Card visual design / template system (Phase 5).
- Whether the card is a static image or a short animated MP4 (Phase 5).
- Rate-limit store migration from memory → Redis (Phase 3).
- Abuse controls beyond basic rate limiting (Phase 6/10).
