# 09 — Architecture Decision Records & Assumptions

Source: `docs/decisions/*.md` (6 ADRs), cross-checked against live code where noted. All 6 were spot-checked for staleness; findings below.

## ADR 001 — App / Raw / Derived Schema Separation

**Decision:** application state lives only in `app.*` (Alembic-managed); `derived.*` is truncate-and-rebuild and must never hold human-authored state.
**Alternative rejected:** mixing human-authored data into `derived.*` for convenience.
**Tradeoff accepted:** no DB-level FK between `app.products.barcode` and `derived.product_dimension` — this is intentional; `derived` is disposable, so a hard FK to it would be a foreign key to something that periodically ceases to exist mid-rebuild.

## ADR 002 — Plugin Tool System

**Decision:** staff tools live under `api/tools/<name>/` with a `MANIFEST`, auto-mounted by `register_tools()` — no `main.py` edits per tool.
**Alternative rejected:** hardcoding each tool's router registration in `main.py`.
**Notable evolution:** the manifest's `required_role` field was **removed in 2026-07** as dead/misleading, in favor of per-route `Depends` guards (superseded by ADR 006's RBAC model). Also: frontend nav is a **static array in `Sidebar.tsx`**, not driven by the `GET /api/tools` discovery endpoint that exists for this exact purpose — the endpoint exists but frontend doesn't consume it. This is a real, current inconsistency (not historical) worth fixing or explicitly deciding to leave alone.

## ADR 003 — Entity Resolution Design (2026-04-25)

**Decisions:**
- Alias table (`app.product_aliases`) lives in `app.*`, not `derived.*`, so confirmed merges survive pipeline rebuilds.
- Remapping happens at the **earliest** aggregation SQL step so every downstream table inherits the canonical barcode automatically — a single point of truth rather than re-joining aliases at every consumer.
- **RapidFuzz with prefix + numeric-token blocking**, not naive O(n²) pairwise comparison — the catalog size made naive comparison ~169M pairs, blocking cuts this to a tractable candidate set.
- **Two-tier confidence threshold**: 78+ auto-suggested, 62–77 held for manual review, tuned empirically against observed false positives in this specific catalog (see `[[project_b3_entity_resolution]]` memory — do not lower the 78 default without re-validating against false-positive rate).

## ADR 004 — Raw Dedup Triggers Kept Outside Alembic

**Decision:** Alembic never touches `raw.*` — migration 004's upgrade is a literal no-op. Dedup triggers are installed idempotently by `scripts/setup_raw_triggers.py`, run manually after first ingestion on a new machine.
**Root cause this fixed:** Alembic previously failed on fresh databases because `raw.*` tables didn't exist at migration time yet, and `raw_tables.sql` originally called a Supabase-only function (`extensions.uuid_generate_v4()`) that doesn't exist on stock Postgres — fixed to the standard `gen_random_uuid()`.
**Operational risk this creates:** the trigger install step is a manual, easy-to-forget step not enforced by any migration tooling — see `10_code_health.md` for the concrete failure mode.

## ADR 005 — BOM (Bill of Materials) Manager Design (2026-05-23)

**Decisions:**
- Primary goal is **fixing stock-position accuracy** for in-house repackaging (e.g. wheat → flour, groundnut → oil) — improved ML signal is a downstream benefit, not the driver.
- **Yield-based `qty_per_unit` is mandatory**, no 1:1 default — repackaging has real, non-trivial yield loss, and defaulting to 1:1 would silently corrupt stock math for every BOM-linked product.
- BOM table lives in `app.*` for the same rebuild-survival reason as ADR 003.
**Tradeoff accepted:** higher staff data-entry friction than a one-click "confirm suggestion" flow, justified because a wrong yield ratio compounds error every single day it's active — the cost of a rare mistake here is much higher than the cost of one extra confirmation click.

## ADR 006 — RBAC: Linear Role Lattice, Not Permission Sets (2026-07-26, shipped as Phase A4)

**Decision:** `ROLE_LEVELS = {staff:1, manager:2, admin:3}` with a `require_role(minimum)` guard factory declared per-route (not as global middleware).
**Alternative rejected:** a full permission-set/ACL model, explicitly deferred until an actual need arises — described as YAGNI until a documented "flip point" occurs (a role pair needing mutually-exclusive, non-hierarchical capabilities).
**Explicit exclusion:** machine/API-key identities are **not** part of this human role ladder — deferred to Phase E (MCP server auth uses a separate scoped API-key mechanism, not `ROLE_LEVELS`).
**Verified against code:** confirmed accurate — `ROLE_LEVELS`, `require_role`, and migration `013` all exist exactly as described.

---

## Cross-Cutting Assumptions Worth Surfacing to Any New Architect

1. **Barcode is assumed globally unique and stable** as the canonical product key across raw/derived/app. Entity resolution (ADR 003) exists precisely because this assumption is imperfect in practice (same physical product, different barcodes) — the alias table is a patch on top of an assumption that doesn't always hold.
2. **The billing system export format is assumed stable.** The whole ingestion layer (frozen, out-of-scope per CLAUDE.md) depends on the Er4u export column layout and the `04-04-202507:29 AM` date-format bug staying consistent. Any billing software upgrade upstream is a silent risk to the entire pipeline with no test coverage guarding against a column-layout change.
3. **Single-store assumption baked into schema design.** There's no `store_id` anywhere — `roadmap.ts` explicitly lists "scaling to 50 stores" as an interview/discussion question, implying the team already knows this is a real architectural gap if the business ever expands, not an oversight.
4. **Derived rebuild is assumed cheap enough to run wholesale.** The entire `derived.*` philosophy (truncate + rebuild) assumes rebuild time stays acceptable as data grows (~2.3M rows today for the largest table). No incremental/delta rebuild strategy exists or is planned — this is a scaling assumption that hasn't been stress-tested.
5. **Agents are assumed containable to "read + suggest."** Phase D's entire safety model rests on agents never getting direct write access. This is a design decision, not yet a battle-tested constraint (no agent code exists yet to test it against).
6. **`sql/derived_tables.sql` is assumed to represent current schema** by anyone bootstrapping a fresh DB per CLAUDE.md's own setup instructions — but the DB survey found it has drifted from the live `sql/rebuild_derived/*` pipeline (see `03_data_layer.md`). This assumption is currently **false** and should be corrected before the next fresh-environment setup.
