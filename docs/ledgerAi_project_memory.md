# LedgerAI — Project Memory Summary

## 1. Project Overview

- **What it is:** LedgerAI is a raw-first, append-only data platform for supermarket billing software that only provides manual CSV/XLS exports (no API).
- **Core problem:** Billing data is messy, inconsistent, and incomplete (no conversion events, spelling issues, snapshot vs event confusion). LedgerAI preserves raw truth, then derives clean, auditable analytics, inventory, and future AI insights.

---

## 2. Current State

- **Implemented & working:**
  - Raw ingestion architecture finalized.
  - Sales **item-wise** raw ingestion complete.
  - Sales **bill-wise** raw ingestion complete.
  - Purchase **bill-wise** raw ingestion complete.
  - Raw schemas stabilized and aligned exactly to exports.
  - Header normalization (`\xa0`, spacing), NaN handling, and float-ID → string fix implemented.
  - GitHub repo initialized; architecture documented in Markdown.
- **Partially working / pending:**
  - Purchase **item-wise** raw ingestion (schema + script pending).
  - Supplier master raw ingestion pending.
  - Item combinations raw ingestion pending.
  - Bulk backfill ingestion scripts not yet executed.
- **Broken or slow:** Nothing currently broken; performance acceptable. No derived layers built yet.

---

## 3. Architecture & Stack

- **Language:** Python
- **DB:** PostgreSQL (Supabase)
- **ORM:** SQLAlchemy (2.0 style)
- **Ingestion:** Pandas + bulk inserts
- **Storage layers:**
  - `raw.*` — append-only truth storage
  - planned `recon.*` — reconciliation views
  - planned `derived.*` — business-ready tables
- **Key constraints:**
  - No billing API; only manual exports.
  - Raw layer must not infer, normalize, or overwrite data.
- **Repo structure:** clear separation of ingestion, models, SQL, and docs.

---

## 4. Data & Context Handling

- No embeddings or ML context yet.
- Context persistence handled via:
  - GitHub repository
  - `LedgerAI_documentation.md` as architectural contract
- New conversations must be rehydrated by sharing this document.

---

## 5. Key Decisions Made

- Raw tables are **append-only**; never updated or deleted.
- Raw schema mirrors exports exactly (including UI/junk columns).
- Snapshots (`item_combinations`) and events (sales/purchases) are modeled separately.
- Inventory is **computed**, snapshots are sanity checks.
- Conversions are **inferred from reconciliation**, never assumed.
- CSV numeric IDs are coerced to TEXT at ingest to preserve identity.
- Raw schema is now **closed** unless billing exports change.
- Historical data **will be backfilled** (not optional).

---

## 6. Known Problems & Limitations

- Billing system does not export:
  - Stock conversion events
  - Stock adjustments
- Item naming is inconsistent; no canonical product layer yet.
- Automation limited to ingestion; exports remain manual.
- No derived or reconciliation logic implemented yet.

---

## 7. Immediate Next Goals

1. Implement **purchase item-wise** raw ingestion.
2. Implement **supplier master** raw ingestion.
3. Implement **item combinations** raw ingestion (snapshot-based).
4. Execute **bulk backfill ingestion**:
   - ~1 year of historical data
   - Month-by-month, append-only
   - Schema frozen during backfill
5. Build first reconciliation view:
   - Sales bill-wise vs item-wise totals.

---

## 8. Non-Goals / Out of Scope

- Real-time ingestion or APIs.
- Cleaning or normalizing raw data.
- Early ML/forecasting before reconciliation.
- Silent correction of inconsistencies.
- Full automation of billing exports (scraping is last resort).
