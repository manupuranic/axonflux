# ADR 004: Raw dedup triggers managed outside Alembic

**Status:** Accepted

## Context

Alembic migration `004_raw_dedup_triggers` originally created BEFORE INSERT dedup triggers and performance indexes directly on `raw.*` tables. This caused a hard failure on any fresh machine where `alembic upgrade head` was run before ingestion:

```
psql ERROR: relation "raw.raw_sales_billwise" does not exist
```

`raw.*` tables are created by `sql/raw_tables.sql` and populated by the ingestion pipeline — neither of which Alembic controls. When Alembic migration 004 ran on an empty database (normal for first-time setup), the raw tables didn't exist yet.

Additionally, `sql/raw_tables.sql` used `extensions.uuid_generate_v4()` — a Supabase-specific schema prefix that doesn't exist on standard PostgreSQL installations. This caused all `CREATE TABLE` statements in `raw_tables.sql` to fail silently, leaving the raw schema empty even after the SQL file was run.

## Decision

1. **Alembic never touches `raw.*`.** Migration 004's `upgrade()` is a no-op. The `include_object` filter in `api/migrations/env.py` already enforces this at the schema level — migration 004 was the only violation.

2. **Raw triggers live in `scripts/setup_raw_triggers.py`.** This script is idempotent (`CREATE OR REPLACE` for functions, `DROP IF EXISTS` + `CREATE` for triggers, `CREATE INDEX IF NOT EXISTS`). It checks that raw tables exist before running and exits with a clear error if they don't.

3. **`sql/raw_tables.sql` uses `gen_random_uuid()`** — a pg_catalog builtin available since PostgreSQL 13, requiring no extension.

## Setup order on a fresh machine

```
sql/raw_tables.sql          → creates raw schema + tables
sql/derived_tables.sql      → creates derived schema + tables + views
alembic upgrade head        → creates app schema + tables
[run ingestion]             → populates raw.*
setup_raw_triggers.py       → attaches triggers to raw tables
pipelines/weekly_pipeline.py → populates derived.*
```

## Consequences

- **Alembic is safe to run on any machine at any time**, before or after ingestion, with no dependency on raw table existence.
- **Trigger installation is a deliberate post-ingestion step** — the setup guide documents it explicitly.
- **Migration 004 downgrade still works** on the original machine where triggers were installed by Alembic. Rollback to revision 003 drops the triggers correctly.
- **`setup_raw_triggers.py` is idempotent** — safe to re-run after schema recreation or re-ingestion.
