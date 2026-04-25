# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

AxonFlux is a raw-first analytics platform for a supermarket's billing software exports. The billing system has no API — staff export CSVs/XLS manually. This project ingests those exports, maintains an immutable raw data layer, rebuilds analytical derived tables on demand, and exposes the data via a FastAPI backend + Next.js dashboard.

## Running commands

**All commands must be run from the project root** (`D:\projects\axonflux`). Python imports like `from config.db import engine` and `from db.db import DB` rely on the project root being in `sys.path`.

### Pipeline (data)
```bash
# Full weekly pipeline: rebuild all derived tables + export Excel sheets
PYTHONPATH=. python pipelines/weekly_pipeline.py

# With ingestion (picks latest file from data/incoming/ per report type)
PYTHONPATH=. python pipelines/weekly_pipeline.py --run-ingestion

# Ingest new export files from data/incoming/
python scripts/ingest_all.py

# Backfill historical data
python scripts/ingest_backfill.py

# Create first admin user (one-time)
python scripts/create_admin.py
```

### API
```bash
# Install API deps (separate requirements file, shares same venv)
pip install -r api/requirements.txt

# Run database migrations (app.* schema only — safe on live DB)
alembic upgrade head

# Install raw dedup triggers (run AFTER first ingestion on a new machine)
python scripts/setup_raw_triggers.py

# Start dev server
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
# Docs: http://localhost:8000/api/docs
```

### Frontend
```bash
cd web
npm run dev    # http://localhost:3000
npm run build  # production build + type check
```

### Tests
```bash
python -m pytest tests/
python -m pytest tests/test_db.py   # connectivity only
```

## Architecture: three immutable layers

The entire system is built around one rule: **the raw layer is never modified, the derived layer is always rebuildable.**

### `raw.*` schema — source of truth
Append-only tables. Every row has `import_batch_id` (UUID) and `source_file_name` for full auditability. File deduplication via SHA-256 hash. Never `UPDATE` or `DELETE` from these tables.

Six tables: `raw_sales_itemwise`, `raw_sales_billwise`, `raw_purchase_itemwise`, `raw_purchase_billwise`, `raw_supplier_master`, `raw_item_combinations` + `ingestion_batches` audit table.

### `derived.*` schema — rebuildable analytics
**Fully truncated and rebuilt on every pipeline run.** Never store application state here. Built by running SQL files in order:

1. `sql/rebuild_derived/00_daily_sales_summary.sql` — daily sales & purchase aggregates (**must run first** — step 01 uses its MIN date as date-spine anchor)
2. `01_product_daily_metrics.sql` — dense (date × product) time series filled to CURRENT_DATE, ~2.3M rows
3. `02_product_daily_features.sql` — lag_1, lag_7, rolling 7/30/60-day avg, stddev, day_of_week
4. `03_product_health_signals.sql` — fast/slow/dead_stock/spike flags + `predicted_daily_demand`
5. `04_product_stock_position.sql` — cumulative pseudo-stock via window functions
6. `05_necessary_views.sql` — dimension views (product_dimension, supplier_location, latest_item_combinations, product_supplier_mapping)
7. `06_supplier_restock_recommendations.sql` — procurement intelligence with lead times
8. `07_daily_payment_breakdown.sql` — cash/card/UPI/credit totals by day
9. `08_customer_dimension.sql` — one row per normalized mobile + one WALK-IN row
10. `09_customer_metrics.sql` — per-customer spend, recency, preferred payment

Two output views: `derived.replenishment_sheet` (products with suppliers) and `derived.conversion_attention_sheet` (products without suppliers).

### `app.*` schema — application state
New schema for human-authored data that must survive pipeline rebuilds. Managed by Alembic (migrations in `api/migrations/`). Tables: `users`, `products` (canonical names/categories), `pipeline_runs`, `cash_closure_records`, `pamphlets`, `pamphlet_items`, `product_aliases` (entity resolution: alias→canonical barcode mapping), `product_merge_suggestions` (pending review queue).

**Critical join pattern** — `app.*` enriches `derived.*`, never replaces it:
```sql
COALESCE(p.canonical_name, d.product_name)  -- app overrides derived, falls back gracefully
```

## Key identifiers

- **`barcode` (TEXT)** is the canonical product key across all schemas. It links `raw.*` tables, `derived.*` tables, and `app.products`.
- **`import_batch_id` (UUID)** groups all rows from a single file ingestion.
- **`mobile_clean` (TEXT)** is the canonical customer key in `derived.customer_dimension` and `derived.customer_metrics`. Always a 10-digit Indian mobile or the synthetic key `'WALK-IN'`.

## Customer analytics — mobile normalization

`customer_mobile_raw` arrives in 4+ formats. All SQL that touches customer identity must normalize it the same way:

```sql
CASE
    WHEN REGEXP_REPLACE(COALESCE(customer_mobile_raw,''), '[^0-9]','','g') ~ '^91([6-9][0-9]{9})$'
        THEN SUBSTRING(digits FROM 3)              -- strip +91 / 91 prefix
    WHEN REGEXP_REPLACE(COALESCE(customer_mobile_raw,''), '[^0-9]','','g') ~ '^0([6-9][0-9]{9})$'
        THEN SUBSTRING(digits FROM 2)              -- strip leading 0
    WHEN digits ~ '^[6-9][0-9]{9}$'
        THEN digits                                -- clean 10-digit
    ELSE NULL                                      -- invalid → walk-in pool
END
```

Walk-in classification (NULL mobile OR name in walk-in list): `'CASH'`, `'X'`, `'MR'`, `'PTF'`, `'SUNDRY'`, `'RETAIL'`, `'CUSTOMER'`, `'CASH CUSTOMER'`, `'GENERAL'`, `'GENERAL CUSTOMER'`, `'WALK IN'`, `'WALK-IN'`, `'WALKIN'`, `'RETAIL CUSTOMER'`. All walk-in bills aggregate under the synthetic key `mobile_clean = 'WALK-IN'`.

## Ingestion pattern

Every ingestion module follows the same structure:
1. A `HEADER_MAP: dict[str, str]` mapping CSV column names → DB column names
2. A `reader` function (`pd.read_excel` or `pd.read_csv` with report-specific options)
3. A call to `raw_ingestion/common/ingest_core.py:ingest_raw_table()` which handles normalization, validation, chunked insert (2000 rows/chunk), and batch tracking

**Do not modify the ingestion code.** It is stable and out of scope.

## API layer

FastAPI app in `api/`. Two DB dependency patterns:
- `get_db()` → SQLAlchemy ORM session for `app.*` writes
- `get_conn()` → raw engine connection + `text()` SQL for `derived.*` and `raw.*` reads

The pipeline is **never imported by the API** — `POST /api/pipeline/trigger` runs `pipelines/weekly_pipeline.py` as a subprocess.

Routers: `auth`, `analytics`, `customers`, `products`, `suppliers`, `pipeline` + auto-discovered tool plugins.

### Tool plugin system
Internal staff tools (cash closure, pamphlet generator, entity resolution) live in `api/tools/<name>/`. Each tool needs `__init__.py` with a `MANIFEST` and `router.py` with an `APIRouter`. `register_tools()` in `api/tools/__init__.py` auto-discovers and mounts them — no changes to `main.py` needed. See `docs/architecture/tool-plugins.md`.

## Date parsing quirk

Raw billing exports have a date format bug: `bill_datetime_raw` stores `04-04-202507:29 AM` (missing space between date and time). The derived layer fixes this with:
```sql
TO_TIMESTAMP(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')
```
Purchase dates use the clean format: `TO_DATE(purchase_date_raw, 'DD-MM-YYYY')`.

## Database credentials

Loaded from `.env` in the project root:
```
user=postgres
password=...
host=localhost
port=5432
dbname=axonflux
SECRET_KEY=...   # required for API JWT auth
```

## Process ports

| Process | Port |
|---|---|
| PostgreSQL | 5432 |
| FastAPI (uvicorn) | 8000 |
| Next.js (`web/`) | 3000 |
| MLflow UI (`ml/`) | 5001 |

---

## Project Roadmap

### ✅ Complete

**Infrastructure & Pipeline**
- 10-step SQL rebuild pipeline (steps 00–09), weekly_pipeline.py
- Folder-based ingestion for 6 report types with SHA-256 deduplication
- Alembic migrations for `app.*` schema
- FastAPI backend: auth (JWT), analytics, customers, products, suppliers, pipeline routers
- Tool plugin system: cash_closure + pamphlets (backends complete)

**Analytics (derived layer)**
- `derived.product_daily_metrics` — date × product time series (~2.3M rows)
- `derived.product_daily_features` — lag, rolling 7/30/60d avg, stddev
- `derived.product_health_signals` — fast/slow/dead/spike flags + predicted_daily_demand (SQL WMA)
- `derived.product_stock_position` — pseudo-stock via cumulative window functions
- `derived.supplier_restock_recommendations` — procurement intelligence
- `derived.daily_sales_summary` + `daily_purchase_summary`
- `derived.daily_payment_breakdown` — cash/card/UPI/credit by day
- `derived.customer_dimension` — normalized mobile + WALK-IN synthetic key
- `derived.customer_metrics` — spend, recency, preferred payment per customer

**Dashboard (Next.js `web/`)**
- Auth (JWT, localStorage), protected layout, sidebar with mobile overlay
- Dashboard: 14 KPI cards, revenue chart, purchase chart, payment breakdown chart, top products card
- Product Health page (paginated, filterable by signal type)
- Replenishment page (filterable by supplier, urgent-only)
- Customers page (search, filters, drawer with purchase history)
- Pipeline trigger modal
- System design page (`/docs`)

**Canonical Products**
- `app.products` table with canonical_name, category, brand
- Seeding script from derived layer
- PATCH API — creates row on first edit, falls back to derived name if not overridden

**Phase A — Operational Completeness ✅ Complete**

**A1 — Cash Closure UI** ✅
Staff submits EOD cash count nightly. Full frontend at `/tools/cash-closure`.
Date picker → system totals vs physical count grid → live delta → submit → manager verify/reject.

**A2 — Daily Ingestion + Refresh Button** ✅
`POST /api/pipeline/trigger` with `run_ingestion=true` flag. "Refresh Data" button on dashboard.
Er4u export automation via Playwright (`scripts/er4u_export.py`) — auto-downloads latest sales file.

**A3 — Pamphlet Generator** ✅
Full builder at `/tools/pamphlet-generator`. Features:
- Product catalog search + custom products (no barcode)
- Per-item: editable display name, MRP, offer price, image URL, highlight badge
- AI-generated highlight copy via Claude Haiku (`POST /{id}/ai/highlights`)
- Compact list view with search filter + edit modal (no inline card expansion)
- Client-side PDF via `@react-pdf/renderer` — A4 landscape, 5×5 grid, Geist font (₹ support)
- Download as PDF, PNG per page, or PNG all-pages merged (pdfjs-dist → canvas)
- Duplicate pamphlet, delete pamphlet
- Import from Google Sheets CSV (auto-converts regular URL to export URL)
- Backend: `api/tools/pamphlets/` — full CRUD + AI endpoint, Alembic migration 005

---

---

### Phase B — ML Upgrade *(after Phase A)*

**B1 — ML Demand Forecasting**
Replace SQL WMA with validated XGBoost/ARIMA model.
- Export `derived.product_daily_features` → parquet → `ml/` notebooks
- Experiment tracking: MLflow (port 5001, `ml/mlflow.db`)
- Notebook sequence: 01_baseline → 02_arima → 03_xgboost → 04_feature_importance
- Promotion: update step 03 SQL formula (simple) OR write to `derived.demand_predictions` (complex)

**B2 — Basket Analysis / Recommendation Engine** ✅
- SQL self-join on `bill_no` → `derived.product_associations` (30,018 pairs, min 5 co-occurrences)
- Metrics: support, confidence (both directions), lift
- `GET /api/products/{barcode}/recommendations` endpoint
- "Frequently Bought Together" in product detail page + product drawer (click any row in Health table)
- ProductDrawer: tinted header, 2×2 stat cards, icon-row recommendation list, chart Y-axis clamped ≥0

**B3 — Product Entity Resolution** ✅
Different barcodes for the same physical product split analytics. Resolution pipeline:
- RapidFuzz clustering (`scripts/cluster_product_names.py`) with prefix+numeric blocking, `--min-score 78` default
- Staff review UI at `/tools/entity-resolution` — swap canonical direction, hover product details (MRP/brand/stock)
- Confirmed aliases stored in `app.product_aliases`, remapped in derived layer via LEFT JOIN + COALESCE
- Remapping at aggregation source (`01_product_daily_metrics.sql`), dimension view (`05_necessary_views.sql`), and basket analysis (`10_product_associations.sql`)
- Alembic migration 006. See `docs/architecture/entity-resolution.md` and `docs/decisions/003-entity-resolution-design.md`

---

### Phase C — AI / Retail Co-pilot *(after Phase B)*

**C1 — Product Content Generation (LLM-powered)**
For promoted products (especially herbals). Requires new `app.products` columns:
`description TEXT`, `tags TEXT[]`, `use_cases TEXT[]`, `diseases_cured TEXT[]`, `key_benefits TEXT[]`.
Script: `scripts/generate_product_content.py` — takes barcode list → calls Claude API →
returns structured JSON → upserts into `app.products`. Framing must be wellness (not medical claims).

**C2 — Product Images**
For promoted products only (select few, not entire catalog).
- **Source priority**: Open Food Facts API (free, has images for FMCG by barcode) → manufacturer site → manual upload
- **Storage**: Cloudflare R2 (S3-compatible, free 10GB) or Vercel Blob
- **DB**: add `image_url TEXT` column to `app.products` — store CDN URL, not binary
- **Script**: `scripts/fetch_product_images.py` — tries Open Food Facts by barcode, falls back to manual

**C3 — Embedding Pipeline + pgvector**
Product catalog → vectors stored in PostgreSQL via pgvector extension.
Rebuilt on each pipeline run.

**C4 — RAG Chatbot**
Query → retrieve relevant products/signals/recommendations → Claude API → response.
Example: *"What should I reorder this week?"*, *"Which herbals are selling well?"*
Chat interface in dashboard sidebar.

**C5 — "What should I do today?" Decision Engine**
Daily briefing combining: restock alerts, demand spikes, dead stock to discount,
new customer trends, cash closure discrepancy flag.

---

### Phase D — Public Presence *(parallel to C)*

Next.js `(public)/` segment: store info, current offers from published pamphlets.
Deploy to Vercel (free). No raw/internal data exposed.
Product pages for promoted items: image, description, tags, key benefits (from Phase C content generation).

---

## What's NOT in scope (do not modify)
- `raw_ingestion/` — ingestion modules are stable, do not touch
- `raw.*` schema — append-only, never UPDATE or DELETE
- `derived.*` tables — never store application state here (truncated on every rebuild)
