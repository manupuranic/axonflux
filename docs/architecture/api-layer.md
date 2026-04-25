# API Layer Architecture

## Overview

The AxonFlux API is a FastAPI application that lives in `api/` alongside the existing data pipeline. It provides HTTP endpoints for the analytics dashboard, canonical product management, internal staff tools, and pipeline control.

## Key Design Decisions

### 1. Reuses existing database infrastructure
The API imports `config/db.py` and `db/db.py` directly — no duplication of engine or session factory. Two FastAPI dependencies wrap the existing patterns:

```python
# api/dependencies.py

def get_db() -> Session:
    """ORM session for app.* writes (users, products, pipeline runs)."""

def get_conn() -> Connection:
    """Raw engine connection for derived.* and raw.* read-only queries."""
```

### 2. Two data access patterns
- **`get_conn` + `text()` SQL** for all `derived.*` and `raw.*` reads. These are pre-computed analytical tables; ORM adds no value here.
- **`get_db` + ORM** for `app.*` table reads and writes. The ORM models live in `api/models/app.py` and tool plugin `models.py` files.

### 3. The pipeline is untouched
`pipelines/weekly_pipeline.py` is never imported or modified by the API. The `POST /api/pipeline/trigger` endpoint runs it as a subprocess via `subprocess.run()` and records the outcome in `app.pipeline_runs`.

## Directory Structure

```
api/
  main.py             — FastAPI app, mounts all routers + tool plugins
  dependencies.py     — DB session, DB connection, JWT auth dependencies
  core/
    config.py         — Settings via pydantic-settings (SECRET_KEY, CORS, etc.)
    security.py       — JWT create/decode, bcrypt password hashing
  routers/
    auth.py           — POST /api/auth/login
    analytics.py      — GET /api/analytics/* (summary, daily-revenue, health-signals, replenishment, demand-trend)
    products.py       — GET/PATCH /api/products/* with derived.* fallback
    suppliers.py      — GET /api/suppliers/*
    pipeline.py       — POST /api/pipeline/trigger, GET /api/pipeline/status
  schemas/            — Pydantic request/response models (auth, analytics, products)
  models/
    app.py            — SQLAlchemy ORM models for app.users, app.products, app.pipeline_runs
  tools/              — Plugin system (see tool-plugins.md)
  migrations/         — Alembic migrations for app.* schema only
```

## Running the API

```bash
# From project root (D:\projects\axonflux)
pip install -r api/requirements.txt

# Fresh DB only: create raw.* and derived.* schemas (not managed by Alembic)
psql -U postgres -d axonflux -f sql/raw_tables.sql
psql -U postgres -d axonflux -f sql/derived_tables.sql

# Run app migrations (app.* schema only — safe on live DB)
alembic upgrade head

# After first ingestion: install raw dedup triggers
python scripts/setup_raw_triggers.py

# Start dev server
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Auto-generated API docs available at: `http://localhost:8000/api/docs`

## Auth Flow

1. `POST /api/auth/login` with `{"username": "...", "password": "..."}` → JWT token
2. All protected endpoints require `Authorization: Bearer <token>` header
3. Token contains `sub` (username), `role` (staff/admin), `user_id`, `full_name`
4. Token expires after 480 minutes (8 hours — one shift)
5. Admin-only endpoints (pipeline trigger, cash closure verify) use `Depends(require_admin)`

## Creating the First Admin User

There is no registration endpoint — users are created directly in the database:

```python
# scripts/create_admin.py
from api.core.security import hash_password
from config.db import SessionLocal
from api.models.app import AppUser

session = SessionLocal()
admin = AppUser(
    username="admin",
    full_name="Store Manager",
    hashed_password=hash_password("your-password-here"),
    role="admin",
)
session.add(admin)
session.commit()
```
