# syntax=docker/dockerfile:1

# ── Stage 1: build the Vite PWA ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so npm ci is layer-cached unless deps change.
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json        ./apps/web/

RUN npm ci

# Source after install to keep the dep-install layer cached.
COPY packages/shared/ ./packages/shared/
COPY apps/web/        ./apps/web/

# Build shared types first (web imports them at compile time).
RUN npm run build --workspace @shortstory/shared
# Build the Vite app. VITE_API_URL is intentionally unset so the PWA calls
# /api/v1/* on the same origin — Caddy proxies those to the backend.
RUN npm run build --workspace @shortstory/web

# ── Stage 2: serve with nginx ─────────────────────────────────────────────────
FROM nginx:stable-alpine AS production

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
