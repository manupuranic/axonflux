# AxonFlux

A raw-first analytics platform for supermarket billing software exports. The billing system has no API — staff export CSV/XLS files manually. AxonFlux ingests those exports, maintains an immutable raw data layer, rebuilds analytical derived tables on demand, and exposes the results through a REST API and Next.js dashboard.

> **Live demo:** _coming soon_ — see [Demo Data Setup](docs/setup/demo-data.md)

---

## Features

- **Append-only ingestion** — raw layer is never modified; every row has a batch ID and source filename for full auditability
- **SHA-256 deduplication** — re-importing the same file is a no-op
- **10-step SQL rebuild pipeline** — daily sales summaries → product time series → rolling features → health signals → stock position → replenishment recommendations → customer metrics
- **Product Health Signals** — fast/slow/dead stock and demand spike flags with predicted daily demand (weighted moving average)
- **Basket Analysis** — market basket associations (support, confidence, lift) via SQL self-join on bill_no
- **Replenishment Recommendations** — per-supplier restock sheets with days-of-cover and urgency flags
- **Customer Analytics** — normalized mobile → spend, recency, preferred payment, purchase history
- **Staff Tools** — Cash Closure (EOD reconciliation) and Pamphlet Generator (PDF/PNG offer sheets with AI-generated copy)
- **Three-schema separation** — `raw.*` (immutable), `derived.*` (rebuildable), `app.*` (application state via Alembic)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL 16 |
| Pipeline | Python, pandas, SQLAlchemy |
| API | FastAPI, Alembic, JWT auth |
| Frontend | Next.js 15, Recharts, shadcn/ui |
| ML (planned) | XGBoost, MLflow |
| Export automation | Playwright |

---

## Architecture

Three immutable layers in a single PostgreSQL instance:

```
raw.*       ← append-only, one row per CSV line, never UPDATE/DELETE
derived.*   ← fully rebuilt on every pipeline run (TRUNCATE + INSERT)
app.*       ← human-authored data (canonical names, user accounts) — survives rebuilds
```

The pipeline is never imported by the API — `POST /api/pipeline/trigger` runs `weekly_pipeline.py` as a subprocess to avoid shared state.

---

## Quick Start

See **[docs/setup/local-development.md](docs/setup/local-development.md)** for full setup.

```bash
# 1. Clone and install
pip install -r api/requirements.txt
cd web && npm install && cd ..

# 2. Configure
cp .env.example .env   # fill in DB credentials and SECRET_KEY

# 3. Database
alembic upgrade head
python scripts/create_admin.py

# 4. Generate demo data (optional — for running without real exports)
python scripts/generate_demo_data.py
cp -r data/sample/* data/incoming/
PYTHONPATH=. python scripts/ingest_all.py
PYTHONPATH=. python pipelines/weekly_pipeline.py

# 5. Run
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
cd web && npm run dev
```

Frontend: http://localhost:3000  
API docs: http://localhost:8000/api/docs

---

## Repository Strategy

This public repo contains all source code, docs, and synthetic sample data. Real exports and credentials are gitignored and never leave the local machine. See [docs/setup/git-strategy.md](docs/setup/git-strategy.md).
