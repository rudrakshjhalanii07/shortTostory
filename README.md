# ShortStory

Share a YouTube Short to your Instagram Story with **creator attribution baked
in** — without redistributing the creator's video.

ShortStory generates a branded, Story-formatted **attribution card** from a
Short's metadata and thumbnail (via the official YouTube Data API), burns the
credits into it with ffmpeg, and hands it to the Instagram Story composer with a
tappable link back to the original Short.

> **Why a card and not the video?** Downloading and reposting YouTube videos
> violates YouTube's ToS and copyright, gets muted by Instagram, and is rejected
> by the App Store / Play Store. ShortStory shares a *citation*, not the work.
> Full rationale: [docs/compliance.md](docs/compliance.md).

## Repository layout

```
apps/
  backend/    Express API + BullMQ render worker        (Phases 2–6)
  mobile/     Expo React Native app + share extension   (Phases 7–9)
packages/
  shared/     TypeScript contract shared by both        (Phase 1) ✅
docs/
  architecture.md   System design + middleware stack
  compliance.md     Legal / platform decision record
  decisions.md      Architecture Decision Records (ADRs)
  progress.md       Phase checklist + deliverables
HANDOFF.md          Current state + next steps for each session
```

## Tech stack

- **Backend:** Node.js 20+, TypeScript, Express, BullMQ, Redis, ffmpeg,
  YouTube Data API v3
- **Mobile:** React Native, Expo, native share extension, deep linking
- **Infra:** Docker, Redis, S3-compatible storage, HTTPS reverse proxy

## Getting started

```bash
nvm use                                          # Node 20 (see .nvmrc)
npm install                                      # installs all workspaces
cp apps/backend/.env.example apps/backend/.env   # then fill in values
npm run build:shared                             # build the shared contract package
npm run dev --workspace @shortstory/backend      # start backend dev server
```

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Architecture & repo structure | ✅ |
| 2 | Backend foundation | ✅ |
| 3 | Redis & BullMQ | ⬜ |
| 4 | YouTube Data API integration | ⬜ |
| 5 | ffmpeg card pipeline | ⬜ |
| 6 | REST API | ⬜ |
| 7 | Mobile foundation | ⬜ |
| 8 | Share extension | ⬜ |
| 9 | Instagram story sharing | ⬜ |
| 10 | Production deployment | ⬜ |

## License

UNLICENSED — private project.
