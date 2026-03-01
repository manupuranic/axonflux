# LedgerAI — Project Memory Summary

## (Updated — Phase 3 Week 3 Complete)

## 1\. Project Overview

**What it is:**LedgerAI is a raw-first, append-only analytical data platform for supermarket billing software that only provides manual CSV/XLS exports (no API).

**Core problem:**Billing data is messy, inconsistent, and incomplete (no conversion events, inconsistent naming, snapshot vs event confusion). LedgerAI preserves immutable raw truth and builds deterministic derived layers to enable analytics, demand modeling, and future AI-driven inventory intelligence.

### Core Philosophy

- Raw layer is immutable truth.
- All business logic lives in derived layers.
- Every derived table is fully rebuildable from raw.
- Never silently “fix” data — detect, reconcile, and rebuild.

## 2\. Current State (After Phase 3 — Week 3)

### ✅ Raw Layer

- Raw ingestion architecture finalized.
- Sales **item-wise** ingestion complete.
- Sales **bill-wise** ingestion complete.
- Purchase **bill-wise** ingestion complete.
- Bulk historical backfill (~1 year) executed.
- Schema drift bug detected and resolved (itemwise vs billwise file mix-up).
- Ingestion guardrails added to prevent format drift.
- Raw tables validated and reconciled.

### ✅ Reconciliation Layer

- derived.daily_sales_summary built and validated.
- derived.daily_purchase_summary built.
- Sales item-wise totals reconciled against bill-wise totals.
- Revenue parity verified.

### ✅ Product-Level Time Series (Dense)

Built:
`derived.product_daily_metrics`

**Grain:**
`(date, product_id)`

**Product identity decision:**
`product_id = barcode`

**Design choice:**

- Dense time series (product × all dates)
- Zero-sale days explicitly stored
- Enables rolling windows and lag features

**Current size:**~2.29 million rows

**Revenue reconciliation validated:**
`SUM(revenue) == raw SUM(net_total)   `

**Index added:**
`CREATE INDEX idx_metrics_product_dateON derived.product_daily_metrics (product_id, date);`

### ✅ Feature Engineering Layer (Completed Week 3)

Built:
`derived.product_daily_features`

**Features implemented:**

- lag_1_qty
- lag_7_qty
- last_7_day_avg
- last_30_day_avg
- last_7_day_stddev (volatility)
- day_of_week

**Implementation details:**

- SQL window functions
- Partitioned by product_id
- Ordered by date

**Full rebuild time (local):**~20 seconds for ~2.3M rows

**Design decision:**

- Full refresh rebuild strategy during development.
- Incremental rebuild deferred.

### ✅ Infrastructure Upgrade

Supabase Free tier limitations encountered:

- 0.5GB DB cap exceeded (185%)
- Statement timeouts during window queries

**Decision:**Migrate analytical workload to local PostgreSQL.

**Completed:**

- pg_dump from Supabase
- Selective schema restore (excluding Supabase internal schemas)
- Local PostgreSQL setup (Windows)
- DBeaver installed for warehouse inspection
- Restore verification (row counts + revenue parity)

LedgerAI analytics now runs on **local PostgreSQL (OLAP warehouse)**.

Supabase removed as primary analytics DB.

## 3\. Architecture & Stack (Updated)

**Language:** Python**Database:** PostgreSQL (Local — OLAP warehouse)**ORM:** SQLAlchemy (2.0 style)**Ingestion:** Pandas + bulk inserts

### Storage Layers

- raw.\* — append-only truth
- derived.\* — deterministic business tables
- Feature layer materialized in SQL
- Dense warehouse-style time series design

### Architectural Shift

**Before:**Cloud OLTP-style usage (Supabase Free)

**Now:**Local OLAP-style warehouse optimized for analytics

Clear separation emerging between:

- Transactional storage
- Analytical demand modeling

## 4\. Key Decisions Made (Expanded)

- Raw tables are strictly append-only.
- Product identity = barcode (Phase 3 decision).
- Dense time series chosen over sparse.
- Feature engineering implemented in SQL (not Python).
- Full-refresh rebuild strategy during development.
- Supabase free tier unsuitable for analytical workloads.
- Migration to local Postgres for performance and scale.
- Always validate derived layers against raw aggregates.
- Schema drift must fail loudly (no silent corruption).

## 5\. Major Issues Resolved in Phase 3

### 1️⃣ File Mix-up During Backfill

- Itemwise file replaced with billwise file.
- Caused NULL product identity.
- Detected via PK constraint violation.
- Fixed via raw truncation and clean re-ingestion.

### 2️⃣ Date Parsing Corruption

Raw value example:
`04-04-202507:29 AM`

Issue: Missing space between date and time.

Solution: Apply REGEXP_REPLACE before TO_TIMESTAMP in derived layer.

Raw layer remained untouched.

### 3️⃣ Supabase Storage Ceiling

- Free tier limit exceeded.
- Window queries timing out.
- Migrated to local Postgres.

### 4️⃣ Window Function Performance

- Added (product_id, date) index.
- Reduced sorting overhead.
- Feature rebuild stable at ~20 seconds.

## 6\. Known Limitations (Current)

- No canonical product normalization layer (barcode-only identity).
- No stock conversion event tracking.
- No incremental feature rebuild yet.
- Purchase item-wise ingestion pending.
- Supplier master ingestion pending.
- Item combinations ingestion pending.
- No ML model yet (features ready).

## 7\. Phase 3 Status

### Phase 3 Scope

- Product-level time series table ✅
- Feature engineering layer ✅
- Semi-automated ingestion ✅
- Infrastructure stabilization ✅

### Week 3 Complete

Dense time series + full feature layer + local warehouse migration completed.

Phase 3 foundation is complete.

## 8\. Next Steps

1.  derived.product_health_signals
    - Fast-moving flag
    - Slow-moving flag
    - Dead stock detection
    - Demand spike detection
    - Volatility risk scoring

2.  Baseline forecasting model
    - Compare last_7_day_avg vs actual
    - Evaluate MAE / RMSE

3.  Restock intelligence logic
    - Days of coverage
    - Safety stock modeling
    - Volatility-aware reorder signals

## 9\. System Maturity Level

LedgerAI has transitioned from:

> CSV ingestion experiment

to

> Deterministic retail demand modeling warehouse

You now have:

- Raw integrity
- Reconciliation validation
- Dense time-aware metrics
- Feature engineering layer
- Infrastructure independence
- Index optimization
- Analytical workload capability

Phase 3 Week 3 marks the transition from data plumbing to intelligence modeling.
