# ADR 001: Separate `app.*` schema from `raw.*` and `derived.*`

**Status:** Accepted

## Context

The existing pipeline uses two schemas:
- `raw.*` — append-only, immutable source-of-truth ingestion tables
- `derived.*` — fully truncated and rebuilt on every pipeline run

The new application layer needs tables for user accounts, canonical products, cash closure records, pamphlets, and pipeline run logs. These contain human-authored state that must persist across pipeline runs.

## Decision

All application-layer tables live in a new `app.*` schema. The `derived.*` schema is never used for application state.

## Consequences

- **Pipeline safety:** Running `weekly_pipeline.py` (which truncates and rebuilds `derived.*`) never affects `app.*` data.
- **Schema isolation:** Alembic migrations only target `app.*`. The `include_object` filter in `api/migrations/env.py` enforces this.
- **Join pattern:** Dashboard queries join `derived.*` (computed) with `app.*` (human-authored) using `COALESCE(p.canonical_name, d.product_name)` — app data enriches derived data without owning it.
- **No foreign keys across schemas:** `app.products.barcode` is logically a FK to `derived.product_dimension.product_id`, but no DB-level constraint enforces this. This is intentional — `derived.*` can be truncated at any time.

## Schema Initialization (per schema)

Each schema has a different owner and initialization path:

| Schema | Created by | Managed by | Notes |
|---|---|---|---|
| `raw.*` | `sql/raw_tables.sql` | Nobody — append-only | Run once on fresh DB, before first ingestion |
| `derived.*` | `sql/derived_tables.sql` | `pipelines/weekly_pipeline.py` | Run once on fresh DB; pipeline rebuilds data, not schema |
| `app.*` | `alembic upgrade head` | Alembic migrations | Safe to run on live DB; IF NOT EXISTS throughout |

Dedup triggers on `raw.*` are installed separately via `scripts/setup_raw_triggers.py` — after first ingestion, because triggers must attach to existing tables. See ADR 004.
