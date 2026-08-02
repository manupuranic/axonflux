# 03 — Data Layer

One Postgres database (`axonflux`), three schemas, strict mutability rules. Below: every table, its grain, keys, relationships, gaps, and an AI-readiness verdict.

## Correction to CLAUDE.md's stated dedup mechanism

CLAUDE.md describes raw dedup as "SHA-256 hash." The actual implementation is more nuanced:
- `raw.ingestion_batches.file_hash` is a **whole-file** hash — dedupes re-uploading the same file.
- **Row-level** dedup is done via **Postgres triggers on natural business keys**, installed by `scripts/setup_raw_triggers.py` (explicitly *not* Alembic-managed — migration `004_raw_dedup_triggers.py` is a no-op): `raw_sales_billwise` on `bill_no`, `raw_sales_itemwise` on `(bill_no, barcode)`, `raw_purchase_billwise` on `(invoice_no, supplier_name_raw)`, `raw_purchase_itemwise` on `(invoice_no, barcode, supplier_name_raw)`.
- These triggers must be installed manually post-ingestion on a new machine (per CLAUDE.md's own setup instructions) — a fresh prod DB that skips this step silently allows duplicate rows.

## Schema: `raw.*` (source of truth, append-only)

| Table | Grain | Key columns | Purpose |
|---|---|---|---|
| `ingestion_batches` | 1 per file import | `id UUID PK`, `file_hash UNIQUE`, `report_type`, `status` | Audit ledger, whole-file dedup |
| `raw_item_combinations` | 1 per item-master snapshot per import | `barcode`, `mrp`, `purchase_price`, `stock` | Item master snapshot |
| `raw_purchase_billwise` | 1 per purchase invoice | `invoice_no`, `supplier_name_raw` | Bill-level purchase totals, GST buckets |
| `raw_purchase_itemwise` | 1 per purchase line item | `invoice_no`, `barcode`, `supplier_name_raw` | Line-level purchase qty/rate |
| `raw_sales_billwise` | 1 per sales bill | `bill_no`, `customer_mobile_raw`, `bill_datetime_raw` | Bill totals, payment split, customer info |
| `raw_sales_itemwise` | 1 per sale line item | `bill_no`, `barcode` | Line qty/rate |
| `raw_supplier_master` | 1 per supplier snapshot per import | supplier identity fields | Supplier location/identity |

**Gap:** none of the raw tables have an FK from `import_batch_id` → `ingestion_batches.id`. An orphaned or typo'd batch ID is possible and would not be caught by the database.

## Schema: `derived.*` (rebuildable analytics, truncate + rebuild every pipeline run)

Built in strict order by `sql/rebuild_derived/00`–`10`. All are **TABLE** except the dimension views in step 05 (per `[[feedback_derived_view_vs_table]]` memory — heavy-CTE objects are materialized as tables for a 12x perf win, since the pipeline rebuild is a free materialization point).

| Step | Object | Type | Grain | Notes |
|---|---|---|---|---|
| 00 | `daily_sales_summary` | TABLE | 1/day | Anchors date-spine for step 01 |
| 00 | `daily_purchase_summary` | TABLE | 1/day | |
| 01 | `product_daily_metrics` | TABLE | 1/(date × product), dense | ~2.3M rows |
| 02 | `product_daily_features` | TABLE | 1/(date × product) | lag_1, lag_7, rolling 7/30/60d avg/stddev; joins `derived.calendar_dim` |
| 03 | `product_health_signals` | TABLE | 1/(date × product) | fast/slow/dead/spike flags, `predicted_daily_demand` (SQL WMA) |
| 04 | `product_stock_position` | TABLE | 1/(date × product) | cumulative pseudo-stock; excludes BOM finished-goods, joins `app.product_bom` |
| 05 | `latest_item_combinations`, `supplier_location`, `product_supplier_mapping` | VIEW | 1/barcode, 1/supplier | Thin dimension views |
| 05 | `product_dimension` | **TABLE** | 1/product | Alias-aware (`app.product_aliases`), overridden by `app.products` |
| 06 | `supplier_restock_recommendations` | TABLE | 1/(date × product), latest only | Procurement intelligence |
| 07 | `daily_payment_breakdown` | TABLE | 1/day | Cash/card/UPI/credit |
| 08 | `customer_dimension` | TABLE | 1/mobile_clean (+1 WALK-IN row) | |
| 09 | `customer_metrics` | TABLE | 1/customer_key | Spend, recency, preferred payment |
| 10 | `product_associations` | TABLE | 1/unordered barcode pair | Basket analysis, 30,018 pairs |

Downstream views (not in the numbered pipeline): `derived.supplier_purchase_sheet`, `derived.replenishment_sheet`, `derived.conversion_attention_sheet`.

**Known drift (flagged by DB survey):** `sql/derived_tables.sql` is a **stale bootstrap snapshot** and has diverged from the live `sql/rebuild_derived/*` pipeline — e.g. bootstrap's `product_stock_position` lacks `total_bom_consumed`; bootstrap's `product_supplier_mapping` still carries a `min_stock` column that `05_necessary_views.sql` dropped; bootstrap's `supplier_restock_recommendations` still has a `COALESCE(sm.min_stock, ...)` fallback the live pipeline removed. **A fresh database bootstrapped from `derived_tables.sql` and then rebuilt via the pipeline will not produce an identical schema** — this file needs regenerating from the live pipeline output, or removing in favor of "just run the pipeline once."

**Hidden dependency:** `derived.calendar_dim` (joined in step 02) is defined only in `scripts/seed_calendar.py`, entirely outside `sql/`. A rebuild-from-scratch that skips this script fails once the table is truly absent (not just empty). This is an undocumented setup step.

## Schema: `app.*` (Alembic-managed, survives rebuilds)

13 migrations (001–013):

| Migration | Adds |
|---|---|
| 001 | `users`, `products`, `pipeline_runs`, `cash_closure_records` (minimal), `pamphlets`, `pamphlet_items` |
| 002 | `products.product_type/is_reviewed/size/colour` |
| 003 | Drops/recreates `cash_closure_records` with full HOTO JSONB structure |
| 004 | No-op (dedup moved to raw triggers, see above) |
| 005 | `pamphlets.rows/cols`, `pamphlet_items.image_url`, barcode nullable |
| 006 | `product_aliases`, `product_merge_suggestions` (entity resolution) |
| 007 | `ml_demand_predictions` (date, product_id PK, p10/p50/p90) |
| 008 | `product_bom`, `product_bom_suggestions` (BOM manager) |
| 009 | Pamphlet DSL versioning: `pamphlet_versions`, `pamphlet_chat_messages`, `pamphlets.template_dsl/theme/current_version_id` |
| 010 | `pamphlet_items.category/unit` |
| 011 | Campaign Studio: `campaigns`, `campaign_products`, `campaign_designs`, `campaign_design_versions`, `campaign_chat_messages`, `asset_library`, `campaign_assets` |
| 012 | `products.image_url` — **dead migration**, column already existed since 001, guarded only by `IF NOT EXISTS` |
| 013 | `CHECK (role IN ('staff','manager','admin'))` on `users.role` |

**Resolved naming question from `07_current_roadmap.md`:** the authoritative ML predictions table is `app.ml_demand_predictions` (migration 007), not `derived.demand_predictions` as one memory snippet suggested — the memory reference is stale/informal.

### ORM coverage gap
`api/models/app.py` covers `users`, `products`, `product_aliases`, `product_merge_suggestions`, `pipeline_runs` — matches migrations exactly. But `api/models/__init__.py` only re-exports `AppUser/AppProduct/AppPipelineRun`; the alias/merge-suggestion models exist but aren't exported (minor consistency gap, likely dead code path). **No ORM models exist at all** for `product_bom`, `product_bom_suggestions`, `ml_demand_predictions`, or anything in `derived.*`/`raw.*` — all of these are accessed via raw `text()` SQL. This is consistent with the "raw-first" philosophy but means schema drift in those tables is caught only by manual review, not the type system.

## Relationships Across Schemas

```
raw.raw_sales_itemwise.barcode ─┐
raw.raw_purchase_itemwise.barcode ─┤→ app.product_aliases.alias_barcode → canonical_barcode
raw.raw_item_combinations.barcode ─┘        │
                                             ▼
                              derived.product_dimension (barcode PK)
                                             │
                    ┌────────────────────────┼─────────────────────────┐
                    ▼                        ▼                         ▼
     derived.product_daily_metrics   derived.product_associations   app.products (barcode)
     derived.product_stock_position ←── app.product_bom (raw_barcode/finished_barcode, excludes finished goods)

raw.raw_sales_billwise.customer_mobile_raw → normalized mobile_clean
                                             ▼
                          derived.customer_dimension / customer_metrics (mobile_clean PK)

app.pipeline_runs.triggered_by ─┐
app.cash_closure_records.submitted_by/verified_by ─┼→ app.users.id (FK)
app.product_aliases.confirmed_by ──────────────────┘
```

`import_batch_id` (present on every raw table) has no FK anywhere — it's a soft-audit column, not an enforced relationship.

## Current Missing Entities

- No `app.agent_runs` / `app.agent_outputs` — required before any Phase D agent can log/audit its work
- No `app.blog_posts` — required for D8 Content Writer Agent and Phase F storefront blog
- No storefront-facing `app.products` columns: `is_featured`, `storefront_slug`, `seo_title`, `seo_description`, `schema_org_json`
- No content-generation columns: `description`, `tags`, `use_cases`, `diseases_cured`, `key_benefits` (Phase C1)
- No `pgvector` extension or embeddings table (Phase C3) — required before any RAG (C4)
- No `raw.ingestion_batches` FK enforcement from child tables

## Unknowns (need verification against a live DB, not just code)

- Whether `scripts/setup_raw_triggers.py` has actually been run on the current production DB (it's a manual, undocumented-in-Alembic step)
- Whether `derived.calendar_dim` currently exists in prod or only via `seed_calendar.py` having been run once historically
- Whether `sql/derived_tables.sql`'s drift from `sql/rebuild_derived/*` has ever caused a real bootstrap failure, or is purely theoretical because nobody bootstraps from scratch anymore
- Actual row counts / table sizes in production beyond the ~2.3M cited for `product_daily_metrics` (relevant for embedding/vector-index sizing later)

## Future Entities (per roadmap)

`app.agent_runs`, `app.agent_outputs`, `app.blog_posts` (Phase D/F); pgvector embeddings table (Phase C3); possibly `app.academy_progress` if the Academy's localStorage-only progress tracker (`web/lib/academy/progress.ts`, explicitly flagged in its own code as a stop-gap) is ever promoted server-side.

## Is the Data Model Sufficient for AI Agents?

**Partially — good foundation, three concrete gaps.**

**What's already sufficient:**
- `derived.product_health_signals` + `derived.supplier_restock_recommendations` already give a Reorder Agent or Weekly Intelligence Agent everything numeric it needs — no new tables required for those two.
- `derived.product_associations` (basket analysis) is directly usable by a Dead Stock Clearance Agent or Pamphlet Intelligence Agent for cross-referencing.
- `app.cash_closure_records` (JSONB HOTO structure) is sufficient for a Cash Discrepancy Agent's 30-day pattern analysis.
- Barcode as canonical key end-to-end (raw → derived → app) means product-centric agents have one reliable join key already.

**What's missing before agents can actually be built:**

1. **No audit/output tables** — every agent in Phase D needs somewhere to write its run (`agent_runs`) and its structured output (`agent_outputs`) for the human-approval UI to render. This is the single hardest blocker — build these two tables before any agent code.
2. **No embeddings/pgvector** — C4 RAG chatbot is entirely blocked on C3 not existing. Product descriptions also don't exist yet (C1), so even once pgvector is added, there's nothing rich to embed except product names/categories.
3. **No structured content fields on products** — an Information Agent or RAG chatbot answering "which herbals are selling well?" today could join `product_dimension` + `product_health_signals`, but couldn't answer anything requiring `description`/`tags`/`key_benefits` semantics, because those columns don't exist.

**Recommendation:** before starting Phase D agent code, run one migration adding `agent_runs` + `agent_outputs` (cheap, high-leverage, unblocks all 7 agents' audit trail at once) — do this before, not during, the first agent build. C1 (product content) and C3 (embeddings) can stay deferred until an actual RAG/Information agent is scheduled, since the numeric-analytics agents (Reorder, Weekly Intelligence, Dead Stock, Cash Discrepancy, Supplier Performance) don't need either.
