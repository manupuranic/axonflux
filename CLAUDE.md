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
pip install -r requirements.txt

# Fresh DB only: create raw.* and derived.* schemas (not managed by Alembic)
psql -U postgres -d axonflux -f sql/raw_tables.sql
psql -U postgres -d axonflux -f sql/derived_tables.sql

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

**A4 — Role-Based Access Control** *(before Phase D)*

Current state: JWT auth works, two roles exist (`staff`, `admin`), `require_admin` dependency exists.
Missing: `manager` role, `require_manager` dependency, enforcement on all tool endpoints.

**Three roles:**
| Role | Who | Access |
|---|---|---|
| `admin` | Developer | Everything + system config + MCP API key management |
| `manager` | Store manager | Verify cash closure, approve agent outputs, approve blog posts, all reports |
| `staff` | Counter staff | Submit cash closure, pamphlet generator, BOM review, trigger pipeline |

**Work:**
- Add `manager` to `app.users.role` check constraint
- Add `require_manager` dependency to `api/dependencies.py`
- Audit all tool endpoints: cash closure verify → `require_manager`, BOM confirm → `require_staff`, agent trigger → `require_manager`
- Phase E MCP needs separate `api_key` auth (machine credential, not user role)
- Frontend: show/hide UI elements based on role from JWT

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

**B4 — BOM Manager** ✅
In-house repackaging blind spot fixed. See `docs/architecture/bom-manager.md`.

**B5 — Test Baseline** *(before Phase C)*

Current: 3 test files (DB connectivity, raw ingestion, insert). No API endpoint tests.
Must establish before Phase C adds LLM calls + storage + agents (hard to test manually).

**Target coverage (critical path only, not exhaustive):**
```
tests/
├── test_db.py              ✅ exists — DB connectivity
├── test_ingestion.py       ✅ exists — raw ingestion
├── test_insert.py          ✅ exists — raw insert
├── test_api_auth.py        login, token decode, role enforcement (staff/manager/admin)
├── test_api_customers.py   lapsed tiers (30/60/90d math), active filter, summary counts
├── test_api_analytics.py   summary endpoint, health signal flags
├── test_api_bom.py         confirm requires qty > 0, reject marks status, duplicate prevention
├── test_pipeline_step04.py BOM consumption math — wrong yield factor = daily stock error
└── test_storage.py         LocalStorageClient upload/delete/url for dev env
```

**Not in scope for B5:** UI tests, ML notebook tests, full pipeline integration tests.
Goal: catch regressions in auth, BOM math, customer tier logic before they hit production.

---

### Phase C — AI / Retail Co-pilot *(after Phase B)*

**C1 — Product Content Generation (LLM-powered)**
For promoted products (especially herbals). Requires new `app.products` columns:
`description TEXT`, `tags TEXT[]`, `use_cases TEXT[]`, `diseases_cured TEXT[]`, `key_benefits TEXT[]`.
Script: `scripts/generate_product_content.py` — takes barcode list → calls Claude API →
returns structured JSON → upserts into `app.products`. Framing must be wellness (not medical claims).

**C2 — Storage Abstraction + Product Images**
First task in C2: build `api/storage/client.py` — S3-compatible abstraction over boto3.
Switching provider (R2 → S3 → any S3-compatible) = change `.env` vars only, zero code changes.

```
STORAGE_ENDPOINT_URL   # R2: https://{acct}.r2.cloudflarestorage.com | S3: omit
STORAGE_ACCESS_KEY     # provider access key
STORAGE_SECRET_KEY     # provider secret key
STORAGE_BUCKET         # bucket name
STORAGE_REGION         # R2: "auto" | S3: "ap-south-1" etc.
STORAGE_PUBLIC_URL     # CDN public base URL (e.g. https://assets.puranic.in)
```

Local dev: `LocalStorageClient` writes to `data/uploads/`, served via FastAPI static files.
Same `StorageClient` interface used by: C2 image fetcher, D7 Image Agent, D8 blog content.

Image sourcing priority: Open Food Facts API (free, by barcode) → web fallback → AI generation (D7).
- **DB**: `image_url TEXT` on `app.products` — stores CDN URL, never binary

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

### Phase D — Agentic Intelligence *(after Phase C)*

Multi-agent system running inside AxonFlux. Agents are staff-triggered or scheduled.
All agents are **read-only + suggest** — no autonomous writes. Human approval before any action.
Parallel agents use async fan-out; sequential agents pass structured output between steps.

**Agent roster:**

| Agent | Orchestration | What it does |
|---|---|---|
| **Reorder Agent** | Parallel per supplier → merge | Reads replenishment sheet + stock + lead times → draft PO per supplier |
| **Weekly Intelligence Agent** | Sequential pipeline | Sales → stock alerts → lapsed customers → cash status → one-screen weekly report |
| **Dead Stock Clearance Agent** | Parallel per category → rank | 4,661 dead stock products → cross-ref basket associations → ranked clearance + bundle suggestions |
| **Pamphlet Intelligence Agent** | Parallel fan-out → rank | Demand signals + expiry risk + basket associations → suggested product list for next pamphlet |
| **Cash Discrepancy Agent** | Sequential analysis | 30-day closure history → pattern detection (recurring? day-of-week bias? worsening?) → severity flag |
| **Supplier Performance Agent** | Parallel per supplier | Spend trend, top products, stockout frequency → one-page brief per vendor |
| **Storefront Agent Group** | Coordinator + 4 sub-agents | Product Selection → parallel (Image Agent + Content Agent + SEO Agent) → Publisher Agent |
| **Content Writer Agent** | Sequential | Topic seed → Claude draft (800–1200 words) → SEO pass → `app.blog_posts` (status: draft) → staff approves → static export |

**Storefront Agent Group (D7) detail:**
- **Product Selection Agent** — fast-moving + in-stock + `is_featured=true` OR agent-ranked → list to feature
- **Image Agent** — Open Food Facts by barcode → web fallback → AI generation → `StorageClient.upload()` → URL stored in `app.products.image_url`
- **Content Agent** — Claude API → description, tags, use_cases, key_benefits (wellness framing, no medical claims)
- **SEO Agent** — Claude API → seo_title (60 chars), seo_description (155 chars), schema.org JSON-LD, storefront_slug
- **Publisher Agent** — upserts `app.products` → exports storefront JSON → git push → Vercel auto-deploys

**Content Writer Agent (D8) detail:**
- Topic seeds from: PHM product catalog, category keywords, basket associations, seasonal patterns
- Draft: Claude API → 800–1200 words, wellness/utility tone, 2–3 internal product page links
- SEO pass: meta_title, meta_description, slug, schema.org `Article` markup
- Stored in `app.blog_posts` with `status='draft'` → staff reviews in AxonFlux dashboard → approve → next export

**New `app.*` tables needed:**
- `app.agent_runs` — audit log: agent name, triggered_by, status, started_at, completed_at, output_summary
- `app.agent_outputs` — structured output per run (JSON): draft POs, clearance lists, reports
- `app.blog_posts` — slug, title, body, meta_title, meta_description, status, product_refs[], published_at

---

### Phase E — MCP Server *(after Phase D)*

AxonFlux exposes a read-only MCP server consumed by **Manastra** (personal intelligence OS at
`D:\projects\Manastra`) for owner briefings and anomaly alerts. No writes via MCP.

**MCP tools exposed:**

```python
axonflux.daily_summary(date?)          # revenue, bills, purchases, top 5 products
axonflux.stock_alerts()                # products at critical stock level (< 7 days cover)
axonflux.lapsed_customers(tier?)       # who hasn't visited by tier (at-risk/lapsed/lost)
axonflux.cash_status(date?)            # closure status, discrepancy amount
axonflux.health_signals(flag?)         # fast/slow/dead/spike product counts + top items
axonflux.weekly_report()               # calls Weekly Intelligence Agent, returns structured JSON
```

**Integration pattern:**
```
Manastra owner asks: "how did the store do this week?"
    → Manastra agent calls axonflux.weekly_report()
    → AxonFlux MCP runs Weekly Intelligence Agent
    → Returns structured JSON
    → Manastra formats with owner's memory context → answers conversationally

Manastra anomaly watchdog (runs nightly):
    → calls axonflux.stock_alerts() + axonflux.cash_status()
    → if critical threshold crossed → Manastra notification to owner
```

**Implementation:** FastAPI MCP endpoint + `mcp` Python package (or raw SSE/JSON-RPC).
Auth: API key scoped to read-only role. No customer PII exposed — lapsed tool returns counts only,
mobile numbers never leave AxonFlux.

---

### Phase F — Puranic Storefront *(depends on C2 + D7 + D8)*

Public storefront at **puranic.in**. Brand: **Puranic**. Tagline: *"Freshness, crafted daily."*
Old PHM government-style logo: footer-only. Wordmark is primary identity.

**Architecture: same repo, separate Vercel project (static export)**
```
Local machine (AxonFlux pipeline runs)
  └── Pipeline step: export public-safe data → web/storefront-data/*.json
        (products, offers, blog posts, store info — zero customer/internal data)
  └── git push → GitHub
        └── Vercel auto-deploys (public) segment only
              Next.js builds static pages from JSON at build time
              Internal dashboard stays local permanently
```

**Deployment:**
- Vercel project root: `web/`, only `app/(public)/` routes deployed
- Domain: `puranic.in` → Vercel
- Images: served from `STORAGE_PUBLIC_URL` (Cloudflare R2 / any S3-compatible, see C2)
- Switching storage provider: change 2 env vars, zero code changes

**Sitemap:**
```
puranic.in/
├── /                          Homepage — hero, featured products, current offer banner
├── /products                  Full catalogue — category filter, search
├── /products/[slug]           Product page — image, description, key_benefits, related products
├── /category/[slug]           Category page — all products in category with filters
├── /offers                    All active pamphlets
├── /offers/[id]               Shareable offer page — WhatsApp-optimised mobile layout
├── /blog                      Blog listing — SEO articles seeded from product catalog
├── /blog/[slug]               Blog post — links to 2–3 product pages, schema.org Article
└── /contact                   Store info, hours, location map, WhatsApp enquiry button
```

**WhatsApp integration:**
- Every product page + offer page: "Enquire on WhatsApp" button (click-to-wa.me link)
- Pipeline generates Meta-compatible product feed (JSON/CSV) → staff downloads → uploads to WhatsApp Business Manager manually (no Meta API needed)
- Offer pages: single-tap share URL optimised for WhatsApp previews (og:image, og:title)

**Content curation:**
- `app.products.is_featured = true` → appears in homepage hero + featured sections (staff-curated)
- Agent-ranked products (D7 Product Selection) → broader catalogue pages
- `app.blog_posts.status = 'published'` → blog (Content Writer Agent D8 drafts, staff approves)

**New `app.products` columns needed:**
```
is_featured        BOOLEAN DEFAULT FALSE   -- staff marks for homepage/hero
storefront_slug    TEXT UNIQUE              -- URL-safe slug for /products/[slug]
image_url          TEXT                    -- CDN URL from StorageClient (C2)
description        TEXT                    -- Content Agent (D7/C1)
tags               TEXT[]                  -- Content Agent
key_benefits       TEXT[]                  -- Content Agent
seo_title          TEXT                    -- SEO Agent (60 chars)
seo_description    TEXT                    -- SEO Agent (155 chars)
schema_org_json    JSONB                   -- schema.org Product JSON-LD
```

**SEO strategy:**
- Static HTML per product → Google indexes "HESARU BELE 500GM Puranic Bangalore" as real URL
- schema.org `Product` markup on product pages (price, availability, brand)
- schema.org `Article` markup on blog posts
- sitemap.xml auto-generated from product + blog slugs on each build
- Blog posts target long-tail: "health benefits of horsegram", "stone-ground wheat flour vs commercial"

---

## What's NOT in scope (do not modify)
- `raw_ingestion/` — ingestion modules are stable, do not touch
- `raw.*` schema — append-only, never UPDATE or DELETE
- `derived.*` tables — never store application state here (truncated on every rebuild)
