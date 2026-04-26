# DevOps Requirements Review — AxonFlux
*Response to: devops_requirements_axonflux_with_examples.pdf*

---

## Overall Assessment

**Goals are valid and achievable.** One-command start via `docker-compose up --build` is the right target. The technical approach (init.sql for DB setup, alembic in entrypoint) is correct. However, the document has **6 gaps** that will cause failures if implemented as written.

---

## Gap 1 — Frontend service missing (CRITICAL)

The document lists only API + DB. AxonFlux has a **Next.js frontend** (`web/`, port 3000) that is a core part of the system. Docker Compose must include a third service:

```yaml
services:
  api:   # port 8000 — FastAPI
  db:    # port 5432 — PostgreSQL
  web:   # port 3000 — Next.js  ← MISSING from your document
```

Without this, the dashboard is not accessible after `docker-compose up`.

---

## Gap 2 — init.sql is incomplete (CRITICAL)

Your example shows:
```sql
CREATE SCHEMA app;
CREATE SCHEMA raw;
CREATE SCHEMA derived;
```

This is insufficient. AxonFlux has two raw SQL files that define **all table DDL** for the `raw.*` and `derived.*` schemas:

- `sql/raw_tables.sql` — 6 raw tables + `ingestion_batches` audit table
- `sql/derived_tables.sql` — all derived analytics tables

The `app.*` schema is managed by Alembic (correct). But `raw.*` and `derived.*` are **not Alembic-managed** — they are created by those SQL files. The init.sql must run both files, not just create empty schemas.

**Correct approach:**
```
db/init.sql should:
  1. CREATE SCHEMA raw; CREATE SCHEMA derived; CREATE SCHEMA app;
  2. \i sql/raw_tables.sql
  3. \i sql/derived_tables.sql
```
Or mount all three files into `/docker-entrypoint-initdb.d/` in order.

---

## Gap 3 — No database healthcheck (will cause crash on first start)

The API container starts and immediately runs `alembic upgrade head`, but PostgreSQL takes a few seconds to be ready. Without a healthcheck, this races and fails.

**Required in docker-compose.yml:**
```yaml
db:
  image: postgres:16
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 5s
    retries: 10

api:
  depends_on:
    db:
      condition: service_healthy  # ← waits for DB before starting
```

---

## Gap 4 — No persistent data volume

Without a named volume, `docker-compose down` deletes the entire database. All raw ingestion data is lost.

**Required:**
```yaml
services:
  db:
    volumes:
      - pgdata:/var/lib/postgresql/data  # ← persist between restarts

volumes:
  pgdata:
```

---

## Gap 5 — `.env` credentials not addressed

All credentials (DB password, `SECRET_KEY` for JWT auth) live in a `.env` file at project root. Docker must pass these through.

**Required in API service:**
```yaml
api:
  env_file:
    - .env
```

Also: the `.env` file must NOT be committed to git. The devops setup should document that staff copy `.env.example` → `.env` before first run.

---

## Gap 6 — `PYTHONPATH` not set in container

All Python imports in this project (`from config.db import engine`, `from db.db import DB`) depend on the project root being in `sys.path`. Inside the container, this must be explicit.

**Required in Dockerfile or docker-compose:**
```yaml
api:
  environment:
    - PYTHONPATH=/app
```

Without this, the API will fail to start with `ModuleNotFoundError`.

---

## One-Time Setup Scripts

Two scripts currently require manual execution after first install. They must be integrated into the automated startup.

### `scripts/setup_raw_triggers.py`
Installs deduplication indexes and triggers on `raw.*` tables. **Already idempotent** (`CREATE INDEX IF NOT EXISTS`). Safe to add to entrypoint — runs every startup, no harm.

### `scripts/create_admin.py`
Creates the first admin user. **Currently interactive** — uses `input()` and `getpass`, which blocks Docker. Must be refactored to read from environment variables:

```bash
# Staff sets these in .env before first run:
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
```

Script logic: if `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars are set AND no admin user exists → create user. Otherwise skip silently. This makes it safe to run every startup.

**Final entrypoint order:**
```bash
alembic upgrade head \
  && python scripts/setup_raw_triggers.py \
  && python scripts/create_admin.py \
  && uvicorn api.main:app --host 0.0.0.0 --port 8000
```

---

## `data/incoming/` — Ingestion Directory

The derived table rebuild reads from `raw.*` in the database — it never touches `data/incoming/`. That folder is only read during ingestion runs (`--run-ingestion` flag or `scripts/ingest_all.py`).

**How files get there — `er4u_export.py`:**
AxonFlux has an automated export script (`scripts/er4u_export.py`) that uses Playwright to log into the Er4u cloud POS (`er4uenterprise.in`) and download CSVs nightly. Currently scheduled via Windows Task Scheduler at 22:00 on the host machine.

**Recommendation: keep er4u on the host, bind-mount the directory.**
Since Er4u is a cloud web app (not local software), Playwright could technically run in Docker, but adding Chromium to the API image adds ~500MB and complexity for no real benefit on a single-machine setup. The simpler architecture:

- Windows Task Scheduler continues running `er4u_export.py` on the host
- `data/incoming/` is bind-mounted into the API container
- Files written by the host script are immediately visible inside the container
- Staff trigger ingestion via the dashboard Refresh button

```yaml
api:
  volumes:
    - ./data/incoming:/app/data/incoming  # host writes, container reads
```

No changes needed to the export script or scheduler.

---

## Corrected docker-compose.yml Structure

```yaml
version: '3.8'

services:
  db:
    image: postgres:16
    env_file: .env
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/01_init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

  api:
    build: .
    ports:
      - "8000:8000"
    env_file: .env
    environment:
      - PYTHONPATH=/app
    volumes:
      - ./data/incoming:/app/data/incoming
    depends_on:
      db:
        condition: service_healthy

  web:
    build: ./web
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  pgdata:
```

---

## Summary of Changes Required

| # | Gap | Severity | Action |
|---|-----|----------|--------|
| 1 | Next.js frontend service missing | Critical | Add `web` service to compose |
| 2 | init.sql only creates schemas, not tables | Critical | Run `sql/raw_tables.sql` + `sql/derived_tables.sql` in init |
| 3 | No DB healthcheck — API crashes on cold start | Critical | Add healthcheck + `depends_on: condition: service_healthy` |
| 4 | No persistent volume for postgres data | High | Add named `pgdata` volume |
| 5 | `.env` credentials not wired into containers | High | Add `env_file: .env` to API and DB services |
| 6 | `PYTHONPATH` not set — all imports fail | High | Add `PYTHONPATH=/app` to API environment |
| 7 | `create_admin.py` is interactive, blocks Docker | Medium | Refactor to read from env vars |
| 8 | `setup_raw_triggers.py` not in startup sequence | Low | Add to entrypoint (already idempotent) |
| — | `data/incoming/` volume | Info | Bind-mount from host; er4u export script stays on Windows Task Scheduler |
