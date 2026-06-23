# Staging / Production Environment Separation

ShortStory uses Docker Compose `--project-name` to run a staging stack alongside
production on the same host without resource conflicts.

---

## Overview

| Resource     | Production             | Staging                    |
|---|---|---|
| Project name | `shortstory`           | `shortstory-staging`       |
| Env file     | `apps/backend/.env`    | `apps/backend/.env.staging`|
| S3 bucket    | `shortstory-prod`      | `shortstory-staging`       |
| Redis port   | internal only          | internal only              |
| HTTPS domain | `api.yourdomain.com`   | `api-staging.yourdomain.com`|

---

## Running production

```bash
# First run: create and start all services.
docker compose --project-name shortstory up -d

# Subsequent deploys (after docker pull or image rebuild):
docker compose --project-name shortstory pull
docker compose --project-name shortstory up -d --remove-orphans
```

---

## Running staging alongside production

1. Copy `.env` to `.env.staging` and update the following keys:
   - `S3_BUCKET=shortstory-staging`
   - `DOMAIN=api-staging.yourdomain.com`
   - Any other environment-specific overrides.

2. Override the env file path using `--env-file` or a staging-specific Compose
   override file (`docker-compose.staging.yml`):

```bash
# Option A — inline env-file override
COMPOSE_ENV_FILES=apps/backend/.env.staging \
  docker compose --project-name shortstory-staging up -d

# Option B — override file (recommended for multiple differences)
docker compose \
  --project-name shortstory-staging \
  -f docker-compose.yml \
  -f docker-compose.staging.yml \
  up -d
```

A minimal `docker-compose.staging.yml` override:

```yaml
services:
  backend:
    env_file:
      - path: apps/backend/.env.staging
        required: true
  caddy:
    environment:
      DOMAIN: api-staging.yourdomain.com
```

---

## MinIO for local development

MinIO is an S3-compatible object store that lets you exercise the full upload
pipeline without live AWS credentials.

```bash
# Start the dev stack (backend + redis + minio):
docker compose --profile dev up -d

# Create the dev bucket (run once after MinIO first starts):
docker compose --profile dev exec minio \
  mc alias set local http://localhost:9000 minioadmin minioadmin
docker compose --profile dev exec minio \
  mc mb local/shortstory-dev
```

Configure `apps/backend/.env` for MinIO:

```dotenv
S3_ENDPOINT=http://minio:9000
S3_BUCKET=shortstory-dev
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

The MinIO console is available at `http://localhost:9001`.

---

## What is isolated per project

Docker Compose namespaces all resources under `--project-name`:
containers, volumes, and networks all carry the project prefix.

This means production `redis_data` and staging `redis_data` are **separate
volumes** — no cross-contamination even on the same host.

---

## Teardown

```bash
# Stop and remove containers (volumes are preserved):
docker compose --project-name shortstory-staging down

# Full teardown including volumes:
docker compose --project-name shortstory-staging down -v
```
