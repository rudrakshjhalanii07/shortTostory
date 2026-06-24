# syntax=docker/dockerfile:1

# ── Stage 1: compile ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so npm ci is cached unless deps change.
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json     ./apps/backend/

RUN npm ci

# Copy source after install to preserve the layer cache above.
COPY packages/shared/ ./packages/shared/
COPY apps/backend/    ./apps/backend/

# Build shared first — backend imports its types at compile time.
RUN npm run build --workspace @shortstory/shared
RUN npm run build --workspace @shortstory/backend

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

# dumb-init: forwards Docker stop signals to Node (prevents zombie processes).
# ffmpeg:    used by the render pipeline in Phase 5.
# curl:      used by Docker HEALTHCHECK below.
RUN apk add --no-cache dumb-init ffmpeg curl

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy manifests and install prod deps only.
# npm ci recreates workspace symlinks (node_modules/@shortstory/shared → packages/shared).
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json     ./apps/backend/

RUN npm ci --omit=dev

# Copy compiled output — workspace symlinks already point here.
COPY --from=builder /app/packages/shared/dist  ./packages/shared/dist
COPY --from=builder /app/apps/backend/dist     ./apps/backend/dist
# Font assets are referenced at runtime by cardRenderer (not compiled into dist).
COPY apps/backend/assets                       ./apps/backend/assets

RUN mkdir -p /app/uploads && chown appuser:appgroup /app/uploads

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fs http://localhost:3000/health | grep -q '"status":"ok"' || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/backend/dist/server.js"]
