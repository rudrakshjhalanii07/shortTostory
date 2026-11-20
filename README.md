# ShortStory

**Turn a YouTube Short into an Instagram Story attribution card.**

ShortStory accepts a YouTube Shorts link, retrieves video metadata and a thumbnail through the official YouTube Data API v3, renders a branded 9:16 attribution card with ffmpeg, and opens the Instagram Story composer with a link back to the original Short.

It is designed to credit the original creator without downloading or redistributing the source video.

> **Product and compliance decision:** ShortStory uses an attribution-card model. It does not download YouTube video streams or re-upload source videos. See [the compliance decision record](docs/compliance.md) for the rationale and guardrails.

---

## How it works

1. Share a YouTube Short to ShortStory, or paste its URL into the app.
2. The mobile app submits the URL to the backend.
3. The API validates the URL, creates a job and places it on the processing queue.
4. A worker retrieves metadata and the thumbnail using the YouTube Data API.
5. The worker renders a 1080 × 1920 JPEG attribution card with ffmpeg.
6. The card is uploaded to S3-compatible storage (or local storage in development).
7. The mobile app retrieves the result and hands the image and original-Short link to Instagram Stories.

~~~text
YouTube share sheet
       |
       v
Expo / React Native app
       |
       | POST /api/v1/jobs
       v
Express API ---- Redis-backed rate limiting
       |
       v
BullMQ queue <----> Redis job store
       |
       v
Card worker
  | YouTube Data API (metadata)
  | Thumbnail retrieval
  | ffmpeg rendering (1080 x 1920)
  | S3-compatible upload
       |
       v
Signed image URL + original Short URL
       |
       v
Mobile app ----> Instagram Story composer
~~~

For the detailed system design, see [docs/architecture.md](docs/architecture.md).

## Features

### Product
- Accepts YouTube Shorts, youtu.be, and standard YouTube watch URLs.
- Captures creator, channel, title, publication and video metadata.
- Generates a branded 9:16 JPEG attribution card.
- Includes a link back to the original YouTube Short.
- Supports URL submission by paste and native share/deep-link flows.
- Integrates with the Instagram Story sharing flow on Android and iOS.

### Backend
- Express REST API with request validation and structured error responses.
- Asynchronous processing with BullMQ and Redis.
- Shared job state and progress tracking.
- YouTube Data API v3 integration.
- ffmpeg-based image rendering.
- S3-compatible uploads and expiring signed download URLs.
- Configurable local/inline development modes.
- Security headers, CORS configuration, request IDs and rate limiting.
- Graceful shutdown handling.

### Engineering and deployment
- TypeScript monorepo with shared API contracts.
- Docker Compose deployment.
- Caddy reverse proxy with automatic HTTPS.
- GitHub Actions workflow for typechecking and container build/publish.
- Architecture Decision Records documenting important trade-offs.

## Tech stack

| Area | Technologies |
| --- | --- |
| Language | TypeScript, JavaScript, Swift (iOS share extension) |
| Backend | Node.js 20+, Express, Zod |
| Queue and state | BullMQ, Redis, ioredis |
| Media | ffmpeg |
| External API | YouTube Data API v3 |
| Storage | AWS S3 SDK, S3-compatible storage, MinIO for local development |
| Mobile | React Native, Expo SDK 51, React Navigation |
| Infrastructure | Docker, Docker Compose, Caddy, GitHub Actions, GitHub Container Registry |

## Repository structure

~~~text
.
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── config/       # Environment validation
│   │   │   ├── lib/          # YouTube, rendering, storage, Redis, logging
│   │   │   ├── middleware/   # Request IDs, logging, error handling
│   │   │   ├── pipeline/     # Card-generation workflow
│   │   │   ├── queues/       # Inline and BullMQ queue adapters
│   │   │   ├── routes/       # Health and job endpoints
│   │   │   └── workers/      # Background card worker
│   │   └── assets/           # Fonts and rendering assets
│   └── mobile/
│       ├── src/
│       │   ├── api/          # Backend client
│       │   ├── hooks/        # Job polling
│       │   ├── lib/          # URL and deep-link parsing
│       │   ├── navigation/
│       │   └── screens/
│       └── ios/              # Native iOS share-extension source
├── packages/
│   └── shared/               # Shared DTOs, job types and constants
├── docs/
│   ├── architecture.md
│   ├── compliance.md
│   ├── decisions.md
│   ├── progress.md
│   └── staging.md
├── docker-compose.yml
├── Caddyfile
└── .github/workflows/ci.yml
~~~

## Getting started

### Prerequisites

- Node.js 20 or later and npm.
- Redis when using BullMQ mode.
- A YouTube Data API v3 key for metadata retrieval.
- An S3-compatible bucket for remote result storage, or local storage for development.
- Docker and Docker Compose for the containerised setup.
- Xcode for building and configuring the iOS share extension.

### Install dependencies

~~~bash
nvm use
npm install
npm run build:shared
~~~

If you do not use nvm, install a compatible Node.js 20+ release directly.

### Configure the backend

Copy the example environment file:

~~~bash
cp apps/backend/.env.example apps/backend/.env
~~~

Set the values required for your chosen development mode. At minimum, configure a YouTube Data API v3 key to process real videos.

The backend validates environment variables at startup. See [apps/backend/.env.example](apps/backend/.env.example) for the complete variable list and [the configuration module](apps/backend/src/config/index.ts) for the validation rules.

**Queue modes**
- **inline:** processes jobs in the API process; useful for local development without Redis.
- **bullmq:** uses Redis and a background worker for queued processing.

The default is bullmq when REDIS_URL is set, otherwise inline.

**Storage modes**
- Configure the S3 bucket, region and credentials to use S3-compatible storage.
- For local development, use the local uploader and set PUBLIC_URL as required by the example environment file.
- The optional MinIO service is available through the Docker Compose dev profile.

Do not commit real API keys, cloud credentials, or populated environment files.

### Run the backend

~~~bash
npm run dev --workspace @shortstory/backend
~~~

The API listens on the configured PORT (default: 3000). Check the health endpoint:

~~~bash
curl http://localhost:3000/health
~~~

### Run the mobile app

In a separate terminal:

~~~bash
npm run start --workspace @shortstory/mobile
~~~

Set EXPO_PUBLIC_API_URL to an API URL reachable from the device or simulator. Do not use localhost on a physical device unless the backend is running on that device.

Platform commands:

~~~bash
npm run ios --workspace @shortstory/mobile
npm run android --workspace @shortstory/mobile
~~~

The iOS share extension includes native source under apps/mobile/ios/ShareExtension/. Follow the setup notes in [docs/progress.md](docs/progress.md) after running Expo prebuild: create the Share Extension target in Xcode, add the checked-in Swift and plist files, and configure the deployment target.

## API

The backend exposes the following job endpoints under /api/v1:

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | /jobs | Validate a YouTube URL, create a job and enqueue processing |
| GET | /jobs/:id | Retrieve job state, progress, result or error |

Example request:

~~~bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/shorts/VIDEO_ID"}'
~~~

The create response includes a jobId, initial state and suggested polling interval. Poll the status endpoint until the job reaches completed or failed.

All API error responses use the shared error envelope and include a request ID. The shared request/response types live in packages/shared.

## Build and verification

The repository includes workspace build and typecheck scripts:

~~~bash
npm run build:shared
npm run typecheck
npm run build
npm run lint
npm run format:check
~~~

The project progress record documents the checks performed during implementation, including backend and mobile TypeScript checks, Docker Compose validation and CI workflow checks. See [docs/progress.md](docs/progress.md) for phase-by-phase deliverables and recorded verification.

A successful typecheck or container build does not, by itself, verify live YouTube API credentials, cloud storage permissions, or real-device Instagram sharing. Those integrations should be tested in the target environment.

## Deployment

The production setup uses Docker Compose for the backend and Redis, Caddy for HTTPS termination, and an S3-compatible object store for generated cards.

The GitHub Actions workflow in .github/workflows/ci.yml runs the repository checks and builds/pushes the backend container image to GitHub Container Registry. The optional SSH deployment step requires deployment secrets to be configured.

See [docs/staging.md](docs/staging.md) for the staging workflow and [docs/decisions.md](docs/decisions.md) for the infrastructure decisions.

## Architecture decisions and compliance

Some important decisions are recorded explicitly:

- **Attribution card, not video redistribution:** avoids downloading and re-uploading third-party video.
- **Single Docker deployment for API and worker:** keeps the persistent queue consumer and native ffmpeg workload in a containerised environment.
- **BullMQ and Redis:** moves rendering out of the request/response lifecycle.
- **Shared TypeScript contracts:** keeps backend and mobile job types aligned.
- **S3-compatible object storage:** separates generated media from API process memory and filesystem lifecycle.

Read the [Architecture Decision Records](docs/decisions.md) and [Compliance Decision Record](docs/compliance.md) before changing the ingestion or media-sharing model.

## Current status and limitations

The implementation progress document records ten development phases, from repository architecture through production deployment. It also records the checks performed and integration work that still requires live credentials or platform-specific setup.

Known validation boundaries include:
- End-to-end S3 upload requires valid storage credentials and bucket configuration.
- iOS share-extension integration requires the documented Xcode target setup.
- Instagram handoff should be verified on physical Android and iOS devices.
- Production behaviour depends on valid API keys, storage configuration, Redis availability and deployment secrets.

For the detailed phase history, deliverables and carried-forward notes, see [docs/progress.md](docs/progress.md).

## License

This repository does not currently include an open-source licence. It may be publicly viewable on GitHub, but that does not grant permission to copy, modify, distribute, or use the code. All rights are reserved unless permission is granted separately.
