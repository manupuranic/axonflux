# AxonFlux — Technical Resume Summary

*Generated 2026-05-30*

---

## 1. Project Overview

### What problem does AxonFlux solve?

A supermarket's billing software has **no API**. Staff export CSVs/XLS manually. The raw exports are malformed (date format bugs, encoding issues, sparse columns), inconsistent across report types, and contain no analytics layer. The store owner had no visibility into demand forecasting, dead stock, customer behaviour, supplier performance, or cash reconciliation.

AxonFlux is the full analytical operating system for this store — ingestion → warehouse → derived analytics → forecasting → AI tools → staff UI — built on raw billing exports as the only data source.

### Major architectural components

| Layer | Technology | Purpose |
|---|---|---|
| Raw warehouse | PostgreSQL `raw.*` | Append-only, immutable source-of-truth |
| Derived analytics | PostgreSQL `derived.*` | Fully rebuildable, 10-step SQL pipeline |
| Application state | PostgreSQL `app.*` | Human-authored, survives pipeline rebuilds |
| Ingestion pipeline | Python + pandas | 6 report types, SHA-256 dedup |
| API | FastAPI | Analytics + tool plugin system |
| Staff dashboard | Next.js 16 + TypeScript | Analytics, tools, AI design interfaces |
| ML layer | XGBoost + MLflow | 7-horizon demand forecasting |
| AI tools | Anthropic SDK | Image agent, pamphlet assistant, campaign design |

### Current maturity level

**Production-deployed internal system** (~Phase B complete):
- Live data ingestion from billing exports
- 10-step SQL rebuild pipeline operational (~2.3M rows per rebuild)
- 5 staff tool plugins in use (cash closure, entity resolution, BOM manager, pamphlet generator, campaign studio)
- XGBoost demand forecasting implemented (MLflow tracking)
- Market basket analysis (30,018+ product pairs)
- Next.js dashboard in daily staff use

Phases C–F (RAG chatbot, multi-agent system, MCP server, public storefront) are designed but not yet built.

---

## 2. Data Architecture

### Raw layer design

```
raw.raw_sales_itemwise       — 30 columns, append-only
raw.raw_sales_billwise       — 27 columns, append-only
raw.raw_purchase_itemwise    — append-only
raw.raw_purchase_billwise    — append-only
raw.raw_supplier_master      — append-only
raw.raw_item_combinations    — append-only
raw.ingestion_batches        — audit table (file_hash UNIQUE, SHA-256)
```

Every row carries `import_batch_id` (UUID) and `source_file_name`. The deduplication mechanism is a `file_hash UNIQUE` constraint on `ingestion_batches` — attempting to re-import the same file fails at the DB level, not application code. This is intentional: the dedup guard is a database invariant, not a policy.

### Derived layer design

The derived layer is **fully TRUNCATE + INSERT on every pipeline run**. It is never treated as a store for application state. The 10-step sequence is strictly ordered because each step depends on the previous:

```
00_daily_sales_summary       → date-spine anchor (MIN date source for step 01)
01_product_daily_metrics     → dense product×date grid (CROSS JOIN)
02_product_daily_features    → rolling stats, lags (uses 01 as base)
03_product_health_signals    → flags + WMA demand (uses 01+02)
04_product_stock_position    → cumulative stock (uses 01+02+BOM)
05_necessary_views           → dimension views (uses all above)
06_supplier_restock_recs     → procurement intelligence (uses 04+05)
07_daily_payment_breakdown   → cash/card/UPI pivot (raw billwise)
08_customer_dimension        → mobile normalization (raw billwise)
09_customer_metrics          → RFM analytics (uses 08)
10_product_associations      → market basket analysis (self-join)
```

### Feature engineering tables

`02_product_daily_features.sql` (146 lines) implements 7 window functions per product:

```sql
-- Lag features
LAG(quantity_sold, 1) OVER (PARTITION BY barcode ORDER BY sale_date) AS lag_1
LAG(quantity_sold, 7) OVER (...)                                      AS lag_7

-- Rolling averages (3 windows)
AVG(qty) OVER (... ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)   AS rolling_avg_7d
AVG(qty) OVER (... ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)  AS rolling_avg_30d
AVG(qty) OVER (... ROWS BETWEEN 59 PRECEDING AND CURRENT ROW)  AS rolling_avg_60d

-- Rolling stddev (for spike detection)
STDDEV(qty) OVER (... ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS rolling_std_30d

-- ML-safe variant (excludes current row to prevent leakage)
AVG(qty) OVER (... ROWS BETWEEN 29 PRECEDING AND 1 PRECEDING)  AS ml_safe_rolling_30d
```

Key correctness detail: the pipeline produces **both** an operational rolling average (includes current row, for dashboards) and an ML-safe rolling average (excludes current row, `ROWS BETWEEN ... AND 1 PRECEDING`) — one column distinction prevents target leakage in model training.

### Append-only philosophy

The `raw.*` schema is never the target of `UPDATE` or `DELETE`. Enforced at multiple levels:

1. **Application code**: `ingest_core.py` only calls `INSERT`
2. **PostgreSQL triggers** (installed via `scripts/setup_raw_triggers.py`): prevent mutation
3. **SHA-256 file deduplication**: prevents re-import

The philosophy: billing data is legal evidence. Once ingested, it cannot be retroactively changed. All corrections happen in `app.*` (via product aliases, canonical names) layered on top.

### Rebuild strategy

The derived layer rebuild is **idempotent and total** — every rebuild produces the same result given the same raw data. This means:

- No migration needed for schema changes to derived tables (just change the SQL, re-run)
- No stale-data bugs possible (full TRUNCATE eliminates partial updates)
- Pipeline can be run at any time without risk

The cost: ~2.3M rows rebuilt per run. The mitigation: window function computation is fast enough in PostgreSQL at this scale (full rebuild in under 60 seconds; query-time optimization 700ms → 55ms achieved by converting heavy VIEW to TABLE).

---

## 3. Technical Achievements

### 3.1 Three-Schema Immutable Warehouse

**What was built**: Three-schema PostgreSQL architecture (`raw.*`/`derived.*`/`app.*`) where each layer has strict write semantics: raw is append-only, derived is truncate-rebuild, app is CRUD.

**Why it matters**: Prevents the most common analytics warehouse failure — application state leaking into analytical tables, making them neither auditable nor rebuildable.

**Technical complexity**: Requires disciplined API design (two separate DB dependency injectors: `get_db()` for ORM writes to `app.*`, `get_conn()` for raw SQL reads from `derived.*`), enforced at the FastAPI dependency level.

**Resume wording**: *Designed and implemented a three-schema PostgreSQL data warehouse (raw/derived/app) with schema-level write semantics enforcement — raw append-only, derived fully rebuildable, application state isolated in Alembic-managed schema.*

---

### 3.2 10-Step SQL Rebuild Pipeline

**What was built**: A deterministic, ordered 10-step SQL pipeline producing ~2.3M rows across 10 tables and 6 views from raw billing exports.

**Why it matters**: The entire analytics layer (demand forecasting, health signals, procurement recommendations, customer RFM, basket analysis) is derived from this pipeline.

**Technical complexity**:
- Step 01 uses the MIN date from step 00 as the date-spine anchor (ordering dependency)
- Steps 02–03 use the ML-safe rolling average trick (`ROWS...1 PRECEDING`)
- Step 04 uses UNBOUNDED PRECEDING cumulative sums for pseudo-stock
- Step 10 is a self-join on bill_no with 3 market basket statistics (support, confidence both directions, lift)
- Date format bug in billing exports handled in step 00 (`TO_TIMESTAMP(raw, 'DD-MM-YYYYHH12:MI AM')` — missing space in source data)

**Resume wording**: *Built a 10-step SQL analytics pipeline using advanced PostgreSQL window functions (LAG, cumulative SUM, ROWS BETWEEN partitions), CROSS JOIN date-spine generation, and self-join market basket analysis — producing ~2.3M rows of ML-ready features from raw billing exports.*

---

### 3.3 Demand Forecasting with XGBoost (B1)

**What was built**: Multi-horizon demand forecasting (h=1..7 days ahead) using XGBoost with quantile regression (P10/P50/P90). 6 additional features engineered in the ML layer beyond the SQL features. MLflow experiment tracking + SHAP explainability.

**Why it matters**: The SQL WMA baseline uses a fixed 0.6/0.3/0.1 weighted average — it cannot capture day-of-week patterns, stockout effects, or product-specific seasonality. XGBoost learns these from data.

**Technical complexity**:
- Separate model per forecast horizon to avoid multi-step error accumulation
- `stockout_proxy` rows excluded from training (demand suppression artifact)
- Target encoding for `product_id` (high cardinality categorical → numeric)
- `zero_run_length` feature captures consecutive zero-sales streaks (dead stock signal)
- Float32 throughout for memory efficiency over ~2.3M training rows

**Resume wording**: *Implemented multi-horizon demand forecasting (7 separate XGBoost models, P10/P50/P90 quantiles) on a 2.3M-row product×date time series — with target leakage prevention, stockout exclusion, and MLflow experiment tracking.*

---

### 3.4 Market Basket Analysis (B2)

**What was built**: Product association mining via SQL self-join on bill_no, computing support, bidirectional confidence, and lift for 30,000+ product pairs.

**Why it matters**: Enables bundle recommendations, dead stock clearance strategy, and pamphlet product selection. All derived purely from transaction data.

**Technical complexity**: Self-join on bill_no creates combinatorial explosion. Noise filtering (`HAVING co_occurrences >= 5`) is essential. P(A), P(B), and P(A∩B) computed in one pass via CTEs rather than multiple table scans.

**Resume wording**: *Built SQL-based market basket analysis (support, confidence, lift) via bill-level self-join on 2+ years of transaction history — producing 30,000+ product association pairs used for procurement recommendations and promotional planning.*

---

### 3.5 Product Entity Resolution (B3)

**What was built**: Fuzzy deduplication pipeline for product barcodes using RapidFuzz clustering (prefix+numeric blocking, `--min-score 78`). Staff review UI at `/tools/entity-resolution`. Confirmed aliases stored in `app.product_aliases`, remapping applied at the SQL aggregation source.

**Why it matters**: Different barcodes for the same physical product split analytics — a product's true demand appears fragmented. Entity resolution corrects this at the warehouse level, not at query time.

**Technical complexity**:
- Blocking strategy (prefix+numeric) avoids O(n²) comparison — essential for 5,000+ product catalog
- Score threshold 78 calibrated against catalog (62–77 produces false positives in this specific domain)
- Remapping applied at step 01 so all downstream analytics inherit correction automatically

**Resume wording**: *Implemented fuzzy product entity resolution (RapidFuzz, blocking-based deduplication, calibrated similarity threshold) with alias propagation through the SQL pipeline — correcting barcode fragmentation in an 8,000+ SKU catalog.*

---

### 3.6 AI Tool Plugin System

**What was built**: Auto-discovered FastAPI plugin architecture for staff tools. Each tool is a directory with `MANIFEST` + `router.py` — no changes to `main.py`. 5 production tools: cash closure, entity resolution, BOM manager, pamphlet generator (16 AI tools via Claude), campaign studio (DSL-based canvas editor with AI assistant).

**Why it matters**: The pamphlet generator and campaign studio use an LLM to manipulate a JSON layout DSL via tool calls rather than generating HTML directly — more robust and controllable.

**Technical complexity**:
- DSL patch tool (`apply_dsl_patch`) allows atomic mutations to a JSON layout tree
- Pagination algorithm for A4 pages handles trailing nodes (banner+footer must land on last page)
- Image agent uses Claude Haiku tool use to search OpenFoodFacts → web fallback → streaming SSE progress

**Resume wording**: *Built an AI-powered document generation system (pamphlet/campaign studio) using an LLM-manipulated JSON DSL — AI tools operate on a structured layout tree rather than raw HTML, enabling deterministic rendering with Claude Haiku tool use.*

---

## 4. Data Engineering Components

### Ingestion pipelines

Pattern across all 6 report types:
1. `HEADER_MAP: dict[str, str]` — maps CSV column names → DB column names
2. `reader()` — pandas `read_excel`/`read_csv` with report-specific options
3. `ingest_core.py:ingest_raw_table()` — normalizes, validates, chunks inserts (2000 rows/chunk)

The chunked insert default (2000 rows/chunk) is important: billing exports can have 50,000+ rows. A single INSERT of that size locks the table for seconds and produces a huge WAL entry. 2000-row chunks keep transaction size bounded.

### ETL workflows

There is no Transform in the raw layer. Raw data is ingested exactly as-is (with column rename only). All transformation happens in the derived layer SQL. This means any transformation bug can be fixed by correcting the SQL and re-running — no raw data is lost.

### Data validation

Three levels:
1. **Ingestion validation**: `ingest_core.py` normalizes types, rejects rows missing required fields
2. **SHA-256 dedup**: prevents double-ingestion at the file level
3. **Reconciliation views** (`sql/recon_views.sql`): `recon.sales_bill_vs_item` compares bill-wise vs item-wise aggregates — discrepancy indicates corrupt export

### Schema evolution handling

11 Alembic migrations manage `app.*` schema evolution. Derived tables need no migration — they're redefined by changing their SQL file and running the pipeline. Result: 0 migrations for analytics changes; all migrations are application-state concerns (new tools, new ML tables, new user features).

### Warehouse design decisions

| Decision | Rationale |
|---|---|
| `barcode TEXT` as canonical key | Billing exports use text barcodes; avoids type coercion bugs |
| `mobile_clean TEXT` as customer key | Normalizes 4+ mobile formats to 10-digit or `'WALK-IN'` synthetic key |
| `derived.*` as TABLE not VIEW | Heavy CTEs must be TABLE — VIEW re-executes on every query (12× perf win) |
| Separate `get_db()` vs `get_conn()` | ORM sessions for `app.*` writes; raw connections for `derived.*` reads |

### Performance optimizations

- **700 → 55ms** query optimization on product health endpoint (VIEW → TABLE conversion)
- **Selective indexes**: `idx_health_product_date`, `idx_stock_product_date` on high-cardinality join columns
- **DISTINCT ON + ORDER BY** for latest-record lookups (efficient alternative to window function rank)
- **Float32 throughout ML pipeline** — memory efficiency over 2.3M training rows
- **Per-horizon models** (h=1..7) — avoids multi-step error accumulation

---

## 5. Analytics & AI Foundations

### Forecasting foundations

- SQL WMA baseline (step 03): `predicted_daily_demand = 0.6×7d + 0.3×30d + 0.1×60d`
- Full feature table (`derived.product_daily_features`): lags, rolling averages, stddev, day-of-week, stockout proxy, holiday calendar
- XGBoost model: 7 separate models (one per forecast horizon), P10/P50/P90 quantiles, MLflow tracking
- Predictions stored in `app.ml_demand_predictions` — served without re-running model

### Feature engineering

| Feature | Where | Purpose |
|---|---|---|
| lag_1, lag_7 | SQL step 02 | Short-term autoregressive features |
| rolling_avg_7d/30d/60d | SQL step 02 | Multi-scale trend signals |
| rolling_std_30d | SQL step 02 | Demand volatility |
| stockout_proxy | SQL step 02 | Demand suppression flag |
| day_of_week | SQL step 02 | Weekly seasonality |
| holiday/festival flags | SQL step 02 + calendar | Event-driven demand spikes |
| days_since_last_sale | ML layer | Sparse product signal |
| zero_run_length | ML layer | Dead stock detection |
| demand_trend_ratio | ML layer | Velocity signal |
| product_id target encoding | ML layer | Cardinality reduction |

### Analytics capabilities live

- **Product health signals**: fast_moving, slow_moving, dead_stock, demand_spike flags (step 03)
- **Procurement recommendations**: days-of-cover, min/max stock, per-supplier restock sheets (step 06)
- **Customer RFM**: recency/frequency/monetary, lapsed cohort detection, preferred payment method (steps 08–09)
- **Market basket analysis**: 30,000+ product pairs with lift/confidence (step 10)
- **Cash reconciliation**: EOD physical count vs system totals, discrepancy tracking
- **BOM-adjusted stock**: cumulative stock corrected for in-house repackaging consumption (step 04)

### Architecture designed to support

- **Phase C**: pgvector embeddings + RAG chatbot (product catalog already in `app.products`)
- **Phase D**: Multi-agent system — reorder, weekly intelligence, dead stock clearance, pamphlet intelligence agents — database schema designed (`app.agent_runs`, `app.agent_outputs`)
- **Phase E**: MCP server exposing analytics tools to external AI systems
- **Phase F**: Public storefront with AI-generated product content and SEO

---

## 6. Technologies

### Languages
- **Python 3.11+** — Pipeline, API, ML, scripts
- **TypeScript 5** — Full frontend
- **SQL (PostgreSQL dialect)** — All analytics, window functions, CTEs, triggers

### Databases
- **PostgreSQL 16** — Primary warehouse (raw/derived/app schemas)
- **SQLite** — MLflow experiment tracking (`ml/mlflow.db`)

### Python Libraries
- **FastAPI 0.135** — API framework
- **SQLAlchemy 2.0** — ORM (`app.*` writes)
- **Alembic** — Schema migrations
- **pandas 2.0** — Ingestion, data transformation
- **XGBoost** — Demand forecasting
- **scikit-learn 1.7** — ML utilities, preprocessing
- **MLflow** — Experiment tracking, model registry
- **SHAP** — Model explainability
- **RapidFuzz 3.0** — Fuzzy string matching (entity resolution, BOM suggestions)
- **Anthropic SDK 0.40** — Claude API (image agent, pamphlet AI, campaign AI)
- **OpenAI SDK 1.30** — OpenAI/OpenRouter fallback
- **Playwright** — Automated billing export downloads
- **openpyxl** — XLSX export generation

### Frontend
- **Next.js 16.2 / React 19.2** — Dashboard + tools
- **Tailwind CSS 4** — Styling
- **Recharts 3.8** — Analytics charts
- **shadcn/ui** — Component library
- **@react-pdf/renderer 4.5** — Client-side PDF generation
- **pdfjs-dist 5.6** — PDF rendering/export
- **Framer Motion 12** — UI animations

### Infrastructure
- Local PostgreSQL 16 (on-prem, no cloud DB)
- Local FastAPI (uvicorn, port 8000)
- Next.js dev server (port 3000)
- MLflow tracking server (port 5001)
- Playwright for automated file downloads
- Tailscale for mobile access

### Analytics Technologies
- PostgreSQL window functions (LAG, AVG, SUM, STDDEV over PARTITION BY)
- CROSS JOIN date-spine generation
- Market basket analysis (support/confidence/lift)
- XGBoost quantile regression
- SHAP feature importance
- RFM customer analytics
- Weighted Moving Average (SQL baseline)

---

## 7. Resume Material

### 3 Concise Bullets

- Built end-to-end analytics warehouse for a supermarket on raw billing CSV exports — three-schema PostgreSQL design (append-only raw, rebuildable derived, CRUD app), 10-step SQL pipeline, ~2.3M row rebuild per run
- Implemented XGBoost demand forecasting (7-horizon, P10/P50/P90 quantiles) on SQL-engineered features (LAG, rolling averages, stockout proxy) with MLflow tracking and SHAP explainability
- Architected AI-powered staff tools (pamphlet generator, campaign studio) using Claude API tool use against a JSON layout DSL, plus market basket analysis (30,000+ product pairs) and fuzzy product entity resolution

### 5 Detailed Bullets

1. **Data Warehouse Architecture**: Designed a three-schema PostgreSQL warehouse enforcing schema-level write semantics — `raw.*` append-only with SHA-256 file deduplication and PostgreSQL triggers, `derived.*` fully rebuildable via a 10-step ordered SQL pipeline (~2.3M rows), `app.*` Alembic-managed application state isolated from analytical rebuilds; FastAPI dual-dependency pattern (`get_db()`/`get_conn()`) enforces schema boundary at the API layer.

2. **SQL Feature Engineering Pipeline**: Built a 10-step SQL analytics pipeline using advanced PostgreSQL window functions — dense product×date grid via CROSS JOIN date-spine, bidirectional LAG features, multi-scale rolling averages (7/30/60-day) with ML-safe `ROWS BETWEEN` variants to prevent target leakage, cumulative pseudo-stock via `UNBOUNDED PRECEDING`, and self-join market basket analysis (support, bidirectional confidence, lift) over 2+ years of transaction history.

3. **Demand Forecasting System**: Implemented multi-horizon XGBoost demand forecasting (7 separate models for h=1..7 days) on a 2.3M-row product×date feature table with quantile regression (P10/P50/P90), 6 additional ML-layer features (days_since_last_sale, zero_run_length, demand_trend_ratio, target-encoded product_id), stockout exclusion, and MLflow experiment tracking with SHAP feature importance.

4. **AI Tool Plugin System**: Built a FastAPI auto-discovered plugin architecture (MANIFEST + router.py per tool) hosting 5 production staff tools — notably a pamphlet generator and campaign studio where Claude Haiku manipulates a JSON layout DSL via tool use, plus an async image agent (OpenFoodFacts → web fallback) with SSE streaming; DSL-based architecture provides deterministic rendering unachievable with LLM-generated HTML.

5. **Product Entity Resolution**: Engineered a fuzzy barcode deduplication pipeline (RapidFuzz, prefix+numeric blocking, calibrated threshold of 78 against 8,000+ SKU catalog) with staff review UI, confirmed aliases stored in `app.product_aliases`, and alias remapping applied at the SQL aggregation source (step 01) so all downstream analytics — forecasting, health signals, basket analysis — inherit corrections automatically.

### Project Description Paragraph

AxonFlux is a production analytics and operations platform for a supermarket that exports billing data manually as CSVs — no API, no structured data pipeline. I designed the full system from scratch: a three-schema PostgreSQL warehouse (append-only raw layer, fully rebuildable 10-step derived analytics layer, Alembic-managed application layer), a Python ingestion pipeline handling 6 report types with SHA-256 deduplication and 2000-row chunked inserts, and a SQL feature engineering pipeline using advanced window functions (LAG, rolling averages, cumulative sums, self-join basket analysis) producing ~2.3M rows of ML-ready features per rebuild. On top of this I built XGBoost multi-horizon demand forecasting (7 models, P10/P50/P90 quantiles, MLflow tracking, SHAP explainability), fuzzy product entity resolution (RapidFuzz, blocking-based deduplication), and 5 AI-powered staff tools including a pamphlet generator and campaign studio where Claude Haiku manipulates a JSON layout DSL via tool use. The system is deployed locally on-prem and used daily by store staff, with a Next.js 16 dashboard, TypeScript throughout, and a FastAPI backend.

---

## 8. Interview Preparation — Top 20 Questions

**Q1: Why three schemas? Why not one schema with flags?**

Single-schema designs conflate write semantics — an UPDATE on a derived table looks identical to an UPDATE on application data. Three schemas enforce at the DDL level that raw data is never modified, derived data is disposable, and application data is authoritative. It also enables parallel development: anyone can rebuild the derived layer without touching user-authored data.

---

**Q2: What happens if the pipeline fails midway — say at step 06?**

Steps 00–05 have already committed their TRUNCATE + INSERT. Steps 07–10 haven't run. The derived layer is now in a partially rebuilt state. Fix: wrap the entire pipeline in a transaction, or rebuild idempotently from the failed step. Current implementation runs steps sequentially without a transaction — a known tradeoff (full transaction on 2.3M rows holds locks too long). Real solution: TRUNCATE all tables at the start (in one transaction), then rebuild.

---

**Q3: What is target leakage and how did you prevent it?**

Target leakage means training features include information about the future target, making the model look better in evaluation than in production. `rolling_avg_30d` uses `ROWS BETWEEN 29 PRECEDING AND CURRENT ROW` — this includes today's sales in today's "feature," which the model would never have in production. The ML-safe variant uses `ROWS BETWEEN 29 PRECEDING AND 1 PRECEDING`, excluding the current row. The operational dashboard uses the leaky version (correct for reporting); training uses the safe version.

---

**Q4: How does market basket analysis work in your SQL?**

Self-join on `bill_no`: join `raw_sales_itemwise` to itself on the same bill number, requiring `barcode_a < barcode_b` to avoid duplicates. Count rows for each (A, B) pair = co-occurrence. Count total bills containing A = support(A). Then: `support = co_occurrences / total_bills`, `confidence(B|A) = co_occurrences / bills_with_A`, `lift = support / (support_A × support_B)`. Filter `HAVING co_occurrences >= 5` removes statistical noise.

---

**Q5: Why XGBoost over ARIMA for demand forecasting?**

ARIMA is univariate — one time series per product. With 5,000+ products, fitting and tuning 5,000+ ARIMA models is operationally expensive. XGBoost is a single model that sees all products simultaneously, with `product_id` (target-encoded) as a feature. It also naturally incorporates external features (day_of_week, holiday flags, rolling stats) that ARIMA cannot. The tradeoff: XGBoost requires a dense training grid, which is why the CROSS JOIN date-spine exists.

---

**Q6: What is target encoding and why use it for product_id?**

One-hot encoding product_id with 5,000+ products creates 5,000 binary columns — extremely sparse and slow. Ordinal encoding implies an ordering that doesn't exist. Target encoding replaces each product_id with the mean target value (historical average demand) — a dense, meaningful numeric representation. Risk: leakage if computed on the full dataset; correct to compute on training fold only.

---

**Q7: How does your ingestion handle duplicate files?**

SHA-256 hash of the file content is computed before ingestion. It's compared against `raw.ingestion_batches.file_hash` which has a UNIQUE constraint. If the hash exists, ingestion aborts at the DB level before inserting a single row. This is enforced at the database level — it cannot be accidentally bypassed in application code.

---

**Q8: What is the DSL in the pamphlet/campaign tools?**

The pamphlet layout is stored as a JSON tree where each node has a type (PageNode, CardNode, BannerNode, etc.), style properties, and children. The AI doesn't generate HTML or CSS directly — instead it calls `apply_dsl_patch` with operations like `{op: "set_style", node_id: "card_1", property: "font_size", value: 14}`. The backend applies the patch to the DSL tree and re-renders to HTML/PDF. This is more robust than LLM-generated HTML because: (1) output is deterministic, (2) invalid patches can be validated before applying, (3) the AI cannot introduce XSS or CSS injection.

---

**Q9: Why is the pipeline triggered as a subprocess from the API?**

If the pipeline were imported as a Python module, a crash in the pipeline (OOM, uncaught exception) could corrupt the API process's state. As a subprocess, the pipeline has its own process, memory, and signal handling. The API just monitors stdout/stderr and the exit code. This also means the pipeline can be tested and run independently of the API.

---

**Q10: How do product aliases propagate through the analytics?**

`app.product_aliases` maps alias barcodes → canonical barcodes. Remapping happens in step 01 (`product_daily_metrics`) via a LEFT JOIN: `COALESCE(a.canonical_barcode, r.barcode)`. Because step 01 is the source of the product×date grid that all subsequent steps join to, alias remapping is inherited automatically by steps 02–10. Fix an alias once and all analytics correct themselves on the next pipeline run.

---

**Q11: What is pseudo-stock and why is it "pseudo"?**

Step 04 computes `pseudo_stock = SUM(purchases) - SUM(sales)` via UNBOUNDED PRECEDING cumulative window functions. It's "pseudo" because: (1) it doesn't account for opening inventory (unknown), (2) it doesn't account for waste/theft/expiry, (3) BOM consumption must be explicitly subtracted. It's a directional signal — when pseudo-stock goes negative, you've definitely sold out. It's not a precise inventory count.

---

**Q12: What is a date-spine and why do you need it?**

The raw sales data has gaps — a product with no sales on Tuesday simply has no Tuesday row. ML models require dense (no missing) time series. A date-spine is a table/CTE of every date from MIN(sale_date) to CURRENT_DATE. CROSS JOIN with the product list creates one row per (product, date) pair, guaranteed. Products with zero sales on a date get `quantity_sold = 0`. Without this, rolling averages would skip missing days and compute wrong windows.

---

**Q13: How does customer mobile normalization work?**

Indian mobile numbers arrive in 4+ formats: `+919876543210`, `919876543210`, `09876543210`, `9876543210`. The normalization SQL uses regex: strip non-digits, then pattern-match to extract the 10-digit core. A CASE expression handles each prefix pattern. Invalid numbers and known walk-in placeholders (CASH, RETAIL, WALK-IN, etc.) map to the synthetic key `'WALK-IN'` which aggregates all anonymous transactions. Runs in step 08 and produces `mobile_clean` — the canonical customer key.

---

**Q14: How did you get 700ms → 55ms on the product health query?**

The health signals endpoint was joining a VIEW. A PostgreSQL VIEW re-executes its entire CTE/query on every access — with window functions over 2.3M rows, that was ~700ms per API call. Converting `derived.product_health_signals` from a VIEW to a TABLE (populated during pipeline rebuild) reduced query time to ~55ms because it's now a regular table scan with an index on `(barcode, sale_date)`. Tradeoff: data is only as fresh as the last pipeline run (acceptable for a daily-cadence system).

---

**Q15: What is the MANIFEST in the tool plugin system?**

Each tool plugin directory has an `__init__.py` exporting a `MANIFEST` — a `ToolManifest` dataclass with: `id`, `name`, `description`, `icon`, `required_role`, `tags`. The auto-discovery in `register_tools()` scans directories, imports the manifest, and mounts the router with the appropriate prefix. The manifest also drives the frontend sidebar (icon, title, role-gated visibility). Adding a new tool requires zero changes to `main.py` or the sidebar component.

---

**Q16: How do you handle the missing space in billing date exports?**

The billing software exports dates as `04-04-202507:29 AM` (no space between date and time). Standard `TO_TIMESTAMP(raw, 'DD-MM-YYYY HH12:MI AM')` fails. The fix: `TO_TIMESTAMP(raw, 'DD-MM-YYYYHH12:MI AM')`. This was a data quality discovery made during step 00 development and is documented as an explicit quirk.

---

**Q17: Why P10/P50/P90 quantiles instead of point forecasts?**

Point forecasts hide uncertainty. For procurement: P10 = almost certainly won't sell more than this (under-stock risk), P50 = median expected demand, P90 = will almost certainly sell at least this much (safety stock). A store manager needs P90 for ordering decisions and P10 for clearance decisions. XGBoost quantile regression (`objective='reg:quantileerror'`) trains three separate models, one per quantile.

---

**Q18: How does the fuzzy entity resolution avoid O(n²) comparison?**

With 8,000+ SKUs, comparing every pair is ~64M comparisons — too slow. Blocking reduces this by only comparing products within the same "block." The blocking strategy: prefix blocking (first 3 characters of product name) + numeric blocking (same numeric suffix). Products in different blocks are never compared. This reduces comparisons from O(n²) to roughly O(n × block_size). The min-score threshold of 78 was calibrated against this catalog — scores 62–77 produced false positives.

---

**Q19: How does the Campaign Studio AI differ from a typical chatbot?**

Most AI chatbots generate text in response to text. The Campaign Studio AI is a design tool — the "language" of the interface is the DSL layout tree, not natural language. The AI's only affordance is to call `apply_dsl_patch` with structured operations. This constrains the AI from producing invalid layouts, injecting malicious content, or generating HTML that breaks the renderer. It's tool-use-only: the AI cannot produce free-form text as output, only structured DSL patches.

---

**Q20: What are the known weaknesses/failure modes of the current architecture?**

1. **Pipeline transaction integrity**: Midway pipeline failure leaves derived layer in inconsistent state (no atomic rebuild)
2. **Pseudo-stock accuracy**: Depends on complete purchase history; missing imports cause negative drift
3. **XGBoost cold start**: New products have no history — model falls back to category means (target encoding), which may be wrong for unusual products
4. **Manual export dependency**: Entire system depends on staff manually exporting CSV files — if exports are delayed or malformed, analytics go stale
5. **No real-time data**: All analytics are as-of the last pipeline run; no streaming ingestion

---

## 9. Knowledge Gaps — 1-Day Reading Checklist

### Gap 1: Window Function Internals
**Where it appears**: Steps 02, 04 — `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, `ROWS BETWEEN 29 PRECEDING AND 1 PRECEDING`

- [ ] PostgreSQL docs: Window Function Calls — frame specification syntax (ROWS vs RANGE vs GROUPS)
- [ ] Understand: why `ROWS BETWEEN 29 PRECEDING AND CURRENT ROW` and `ROWS BETWEEN 29 PRECEDING AND 1 PRECEDING` produce different results on the same partition
- [ ] Test: write a query on `derived.product_daily_features` and verify `lag_1` is correct for a product with missing days

### Gap 2: XGBoost Quantile Regression
**Where it appears**: `ml/train.py` — `objective='reg:quantileerror'`, separate model per quantile

- [ ] XGBoost quantile regression docs — what the loss function actually optimizes
- [ ] Understand: why training 3 models (P10/P50/P90) can produce quantile crossings (P10 > P50) and when that happens
- [ ] Read SHAP output: run `ml/train.py`, open MLflow UI at port 5001, examine feature importance. Can you explain why the top features make sense for this catalog?

### Gap 3: Target Encoding Leakage
**Where it appears**: `ml/train.py` — `product_id_target_encoded`

- [ ] Sklearn TargetEncoder docs — especially the `cv` parameter (cross-fitting to prevent leakage)
- [ ] Understand: if you compute target encoding on the full dataset before train/test split, you've leaked future demand into the encoding
- [ ] Check: does `ml/train.py` fit the encoder on training data only, or the full dataset? If the latter, that's a leakage bug worth fixing.

### Gap 4: Market Basket Analysis Statistics
**Where it appears**: Step 10 — support, confidence, lift

- [ ] Wikipedia: Association rule learning — support, confidence, lift definitions
- [ ] Understand: why is lift more useful than confidence alone? (confidence(butter|bread) is high because bread is common, not because they're associated)
- [ ] Test: open `derived.product_associations`, find a product you know, check its top lift associations. Do they make intuitive sense?

### Gap 5: DSL Architecture — Why JSON Tree Over HTML
**Where it appears**: `api/tools/pamphlets/`, `api/tools/campaign_studio/` — `apply_dsl_patch`, node types

- [ ] Read `api/agents/tools/pamphlet_dsl.py` — understand the patch operations and node schema
- [ ] Read `api/tools/pamphlets/render/html.py` — understand how the DSL tree becomes HTML
- [ ] Think through: what would break if the AI generated raw HTML instead? (XSS, non-deterministic rendering, inability to validate). The DSL pattern is the same reason React uses a virtual DOM — mutations through a controlled API, not direct DOM manipulation.

### Gap 6: Alembic Migration Patterns
**Where it appears**: 11 migrations in `api/migrations/versions/`

- [ ] Alembic docs: autogenerate — how Alembic detects schema changes
- [ ] Read migrations 006 (entity resolution) and 009 (pamphlet DSL) — non-trivial JSONB column additions and constraint changes
- [ ] Understand: why Alembic doesn't manage `raw.*` or `derived.*` schemas (different write semantics — raw never changes, derived is always rebuilt from scratch)

**Priority order**: Gap 3 (target encoding leakage — potential bug) → Gap 1 (window functions — used everywhere) → Gap 2 (XGBoost quantile) → Gap 4 (basket analysis math) → Gap 5 (DSL architecture) → Gap 6 (Alembic)
