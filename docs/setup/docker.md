# Docker Setup

## Overview

Docker Compose runs the full stack — database, API, and frontend — as isolated containers. All three talk to each other over Docker's internal network. No local PostgreSQL or Python install needed.

| Container | Image | Port | Role |
|---|---|---|---|
| `axonflux-db` | `postgres:16` | 5432 (internal) | PostgreSQL database |
| `axonflux-api` | built from `Dockerfile` | 8000 | FastAPI + pipeline scripts |
| `axonflux-web` | built from `web/Dockerfile` | 3000 | Next.js frontend |

---

## How Each Service Works

### db

Runs `postgres:16`. On first startup (empty `pgdata` volume), Postgres executes every file in `docker-entrypoint-initdb.d/` in alphabetical order:

| File | Source | What it creates |
|---|---|---|
| `02_raw.sql` | `sql/raw_tables.sql` | `raw.*` schema + all raw tables |
| `03_derived.sql` | `sql/derived_tables.sql` | `derived.*` schema + all derived tables |

**This only runs once.** After the volume is populated, Postgres skips init scripts on all subsequent startups and restores from the persisted volume.

A healthcheck (`pg_isready`) gates the API — it won't start until Postgres is accepting connections.

### api

Built from `Dockerfile` (Python 3.11-slim). On every startup it runs a startup chain before uvicorn:

```
alembic upgrade head
  → creates app.* schema + all application tables (users, products, pamphlets, etc.)
  → idempotent: safe to run on every boot, skips already-applied migrations

python scripts/setup_raw_triggers.py
  → installs dedup triggers on raw.* tables
  → idempotent

uvicorn api.main:app --host 0.0.0.0 --port 8000
  → starts the FastAPI server
```

**Important env var overrides** set in `docker-compose.yml`:
- `host: db` — overrides `host=localhost` from `.env` so SQLAlchemy connects to the `db` container, not `localhost` (which doesn't exist inside Docker)
- `PYTHONPATH: /app` — makes Python resolve `from config.db import engine` etc.

### web

Built from `web/Dockerfile` (Node 20 Alpine). Runs `npm run build` during image build, then `npm start`. All API calls from the browser use relative paths (`/api/...`). `next.config.ts` rewrites those to `http://api:8000/api/...` server-side, so the browser never needs to know the API's internal address.

```
Browser → GET /api/analytics/summary
  → Next.js server (port 3000)
  → rewrite: http://api:8000/api/analytics/summary  (Docker-internal)
  → FastAPI
```

---

## Data Schemas: Who Creates What

| Schema | Created by | Managed by | Notes |
|---|---|---|---|
| `raw.*` | `02_raw.sql` (init script) | never modified | append-only source of truth |
| `derived.*` | `03_derived.sql` (init script) | pipeline (`weekly_pipeline.py`) | truncated + rebuilt on each run |
| `app.*` | Alembic (`alembic upgrade head`) | Alembic migrations | application state, survives pipeline rebuilds |

---

## First-Time Initialisation

These steps only need to run once on a fresh Docker setup (empty `pgdata` volume).

### 1. Create `.env`

```
user=postgres
password=your_password
host=localhost        # used locally; Docker overrides this to "db" automatically
port=5432
dbname=axonflux
SECRET_KEY=generate-a-long-random-string
POSTGRES_PASSWORD=your_password
```

Generate `SECRET_KEY`:
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

`POSTGRES_PASSWORD` must match `password` — Postgres uses it to initialise the superuser.

### 2. Build and start

```powershell
docker compose up --build -d
```

Watch until the API is ready:
```powershell
docker compose logs -f api
# Wait for: "Application startup complete."
```

### 3. Create admin user

The API has no admin user yet — login will fail. Run this once:

```powershell
docker exec -it axonflux-api python scripts/create_admin.py
```

Prompts for username and password interactively. Choose any credentials.

### 4. Load demo data

The database has empty tables at this point. To populate with 6 months of synthetic FMCG data:

```powershell
docker exec axonflux-api python scripts/demo_reset.py --yes
```

This generates data, ingests it into `raw.*`, and runs the full 10-step derived pipeline. Takes 2–3 minutes.

### 5. Open the dashboard

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/api/docs

---

## Day-to-Day Commands

```powershell
# Start stack (after first setup)
docker compose up -d

# Stop stack
docker compose down

# View logs
docker compose logs -f api
docker compose logs -f web

# Reset demo data (keeps DB structure, regenerates data)
docker exec axonflux-api python scripts/demo_reset.py --yes

# Full wipe (destroys pgdata volume — runs init scripts again on next up)
docker compose down -v
```

---

## Troubleshooting

**API fails to start / DB connection error**
The `host: db` override in `docker-compose.yml` must be present. If missing, the API reads `host=localhost` from `.env` and cannot reach Postgres.

**Login returns 404**
The Next.js rewrite in `next.config.ts` must be present — it proxies `/api/*` to the API container. Without it, browser requests hit the Next.js server on port 3000 which has no `/api/*` routes.

**Init scripts didn't run / tables missing**
Init scripts only run on an empty volume. If `pgdata` already exists from a previous run, drop it: `docker compose down -v`, then `docker compose up --build -d`.

**`create_admin.py` in startup chain hangs**
`create_admin.py` is intentionally excluded from the docker-compose startup command — it requires interactive input. Run it via `docker exec -it` after the stack is up (see Step 3 above).
