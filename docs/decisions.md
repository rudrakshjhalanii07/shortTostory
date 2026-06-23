# Architecture Decision Records

Decisions are numbered sequentially. Each record captures what was decided,
why, and what alternatives were rejected. Preserved permanently — do not remove
old entries.

---

## ADR-001 — Model B: Attribution Card (no video redistribution)

**Date:** Phase 1  
**Status:** Accepted

**Context:** The original product spec described downloading YouTube Shorts with
`yt-dlp` and reposting them with a credit overlay. This mechanic violates
YouTube ToS, infringes copyright, triggers Instagram audio fingerprinting, and
is rejected by both app stores under Apple Guideline 5.2.3 / equivalent Play
policy.

**Decision:** ShortStory generates a branded **attribution card** in Instagram
Story format (1080×1920) from metadata and the thumbnail returned by the
official YouTube Data API v3. No source video is downloaded or redistributed.

**Alternatives rejected:**
- *Model A (creator OAuth):* Valid but adds Google OAuth scope and verification
  logic; deferred as a future upgrade path.
- *Model C (CC-licensed only):* Too narrow a catalog for an initial product.
- *Build as-is:* Unacceptable legal and store-review risk.

**Consequences:** `yt-dlp` is permanently excluded. ffmpeg still earns its keep
rendering the card. The `license` field on `VideoMetadata` is retained so Model
A/C can be layered on later without reopening compliance.

See [compliance.md](./compliance.md) for full rationale.

---

## ADR-002 — Single Docker server (no hybrid Vercel/Docker split)

**Date:** Phase 2  
**Status:** Accepted

**Context:** The question was whether to run the Express HTTP API on Vercel
Fluid Compute and the BullMQ render worker on Docker, or keep both on a single
Docker server.

**Decision:** Single Docker server (Express API + BullMQ worker + Redis in one
Compose stack).

**Rationale:**
- ffmpeg is a native binary; it's a cleaner fit for a container than a serverless
  function package.
- The BullMQ worker is a persistent queue consumer — the opposite of stateless
  function invocations.
- Redis is already required; it runs in the same Compose stack with no external
  service.
- Compute is CPU-intensive (ffmpeg rendering); per-invocation serverless pricing
  would be unpredictable at scale.

**Future path:** If the HTTP API layer needs to scale independently, extract it
to Fluid Compute at that point. The shared contract in `@shortstory/shared` and
the clean app-factory pattern in `app.ts` make that refactor straightforward.

---

## ADR-003 — Custom request logger over pino-http

**Date:** Phase 2  
**Status:** Accepted

**Context:** `pino-http` was the initial choice for request/response logging.
Under `module: NodeNext` resolution, its CommonJS default export does not
expose a callable signature to TypeScript, producing `TS2349` errors. The
workaround (dynamic `require`, `createRequire`, or `// @ts-ignore`) trades one
problem for another.

**Decision:** Replaced `pino-http` with a thin custom middleware
(`requestLogger.ts`) that uses the project's shared Pino instance directly.
The middleware records method, URL, status code, and duration (via
`process.hrtime.bigint()`) on `res.on('finish')`.

**Alternatives rejected:**
- *Keep pino-http with `require()`:* Breaks ESM consistency.
- *Downgrade to CommonJS:* The entire repo is ESM; a single-package downgrade
  creates an inconsistent boundary.

**Consequences:** We lose pino-http's child-logger-per-request pattern. This is
acceptable — structured log fields carry the same correlation data.

---

## ADR-004 — RATE_LIMITED belongs in the shared JobErrorCode union

**Date:** Phase 2  
**Status:** Accepted

**Context:** `AppError` in the backend initially declared `RATE_LIMITED` as a
local string literal outside `JobErrorCode`. The mobile client therefore had no
typed representation of this error and would fall through to a generic handler.

**Decision:** `RATE_LIMITED` was added to `JobErrorCode` in
`packages/shared/src/job.ts`. The local override in `AppError` was removed.

**Consequences:** The mobile app can exhaustively switch on every error code,
including rate-limit responses, without knowing about backend internals. Any
future error code that a client must handle specifically must be added to the
shared union — not declared locally in the backend.

---

## ADR-005 — UUID v11 (security), dumb-init, 16 KB body cap

**Date:** Phase 2  
**Status:** Accepted

**Context:** Several small decisions bundled together during Phase 2 hardening.

- **uuid v10 → v11:** v10 has a moderate CVE (GHSA-w5hq-g745-h8pq, missing
  buffer bounds check in v3/v5/v6). Upgraded immediately on discovery.
- **dumb-init as PID 1:** Without an init process, Docker stop sends SIGTERM to
  PID 1 (Node), but Node running as the first process ignores it by default,
  leading to SIGKILL after the timeout. `dumb-init` forwards signals correctly
  and reaps zombie processes.
- **16 KB JSON body cap:** Express defaults to 100 KB. Tightening to 16 KB
  blocks trivial payload-inflation attacks on job-submission endpoints without
  affecting any legitimate use case.

---

## ADR-006 — ffmpeg pre-installed in Phase 2 Dockerfile

**Date:** Phase 2  
**Status:** Accepted

**Context:** ffmpeg is used in Phase 5 (render pipeline), not Phase 2. However,
adding it to the Dockerfile in Phase 5 would invalidate all cached layers above
it and require a full image rebuild in CI.

**Decision:** Install ffmpeg (and dumb-init, curl) in the production image now,
with a comment noting their usage phase. The image is slightly larger but the
layer cache is preserved across all subsequent phases.

---

## ADR-007 — Phase 3 implementation choices (ioredis, BullMQ, rate-limit-redis, job storage)

**Date:** Phase 3  
**Status:** Accepted

**Context:** Four small decisions made during Phase 3 that each have a
non-obvious rationale worth preserving.

**ioredis import style — named `{ Redis }`, not default:**  
Under `module: NodeNext`, TypeScript resolves `import Redis from 'ioredis'` as
a namespace (no construct signatures). The package exports both a default and a
named `Redis` symbol; `import { Redis } from 'ioredis'` is the form that
TypeScript resolves correctly as a class.

**BullMQ connection — `{ url }` options object, not a shared ioredis instance:**  
BullMQ requires ioredis connections created with `maxRetriesPerRequest: null`
and `enableReadyCheck: false` (needed for blocking commands). Rather than
maintaining a separate "BullMQ-compatible" singleton, we pass
`{ url: REDIS_URL }` as connection options; BullMQ creates and manages its own
connections internally. The general-purpose app client (`getRedis()`) is kept
separate and used only for health checks, the job store, and the rate limiter.

**`rate-limit-redis@4`, not v5:**  
`rate-limit-redis@5` requires `express-rate-limit >= 8.5.0`. The project uses
`express-rate-limit@7`. v4 is compatible with v7 and otherwise identical in
interface. If `express-rate-limit` is ever upgraded to v8, upgrade
`rate-limit-redis` to v5 at the same time.

**Job records as JSON strings, not Redis hashes:**  
`Job` has deeply nested optional fields (`progress`, `metadata`, `result`,
`error`). Storing as a JSON string under `job:{id}` with `SET … EX` is simpler
than flattening nested types into hash fields and back. TTL is set at 24 hours
— long enough for the mobile client to poll within a session, short enough to
keep Redis memory bounded.
