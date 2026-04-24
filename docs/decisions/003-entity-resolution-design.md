# ADR 003: Product Entity Resolution — Design Decisions

**Status:** Accepted  
**Date:** 2026-04-25

## Context

Billing exports produce inconsistent product names across barcodes. The critical problem: **two different barcodes assigned to the same physical product** splits analytics — health signals, stock positions, restock recommendations, and basket analysis all treat them as separate products.

Secondary problem: poorly named barcodes without a `canonical_name` in `app.products`.

## Key Decisions

### 1. Alias table in `app.*`, not `derived.*`

**Decision:** `app.product_aliases` lives in the `app` schema (Alembic-managed), not `derived`.

**Why:** Aliases are human-confirmed decisions that must survive pipeline rebuilds. The `derived` schema is truncated on every rebuild — storing aliases there would destroy confirmed merges. This follows the existing pattern: `app.*` stores human-authored state, `derived.*` stores computed analytics.

### 2. Remap at aggregation source, not at the view layer

**Decision:** Alias remapping happens in `01_product_daily_metrics.sql` (the source of all downstream analytics), not just in `05_necessary_views.sql`.

**Why:** If remapping only happened in `product_dimension` (a view), then `product_daily_metrics`, `product_health_signals`, `product_stock_position`, and `product_associations` would still have split barcodes. By remapping at step 01, all downstream tables automatically consolidate. The view layer also remaps for any direct raw-table queries.

**Trade-off:** Adds a LEFT JOIN to three CTEs in step 01. With an empty `app.product_aliases` table, all COALESCE calls fall through to the original barcode — zero regression risk.

### 3. RapidFuzz with blocking, not naive pairwise comparison

**Decision:** Products are grouped into comparison blocks by (first-3-chars prefix + extracted numeric token) before running `rapidfuzz.process.cdist`.

**Why:** ~13K barcodes × 13K = 169M comparisons. Without blocking, this requires a 169M-element distance matrix (~1.3GB RAM). Blocking by prefix + numeric keeps each block under 500 items, making `cdist` fast and memory-safe.

**Trade-off:** Products with completely different name prefixes won't be compared (e.g., "SURF EXCEL 1KG" vs "WASHING POWDER SURF 1KG"). This is acceptable — these rare cases need manual identification.

### 4. Two-tier confidence scoring (78+ green, 62–77 yellow)

**Decision:** Default `--min-score 78` for production use. Scores 62–77 are stored but filtered out by default.

**Why:** Empirical testing on this specific catalog showed 62–77 range is mostly false positives — same brand, different product (e.g., "BARNYARD NOODLES" vs "BARNYARD VERMICELLI"). Score 78+ has very high true-positive rate. Staff confirmed this threshold after reviewing dry-run output.

**Trade-off:** Some true duplicates in the 62–77 range will be missed by default. Staff can run `--min-score 62` from CLI to review the yellow tier manually.

### 5. Synchronous recompute endpoint (not fire-and-forget)

**Decision:** `POST /recompute` runs the clustering script synchronously and returns the result.

**Why:** Original fire-and-forget design (`subprocess.Popen`) swallowed errors silently — the script would fail and the UI showed "no suggestions" with no feedback. Synchronous execution (`subprocess.run`) returns errors directly to the frontend.

**Trade-off:** The request blocks for 30–90 seconds during clustering. Acceptable for an admin-only action that runs occasionally.

### 6. Human-in-the-loop, not auto-merge

**Decision:** All merges require explicit human confirmation. No auto-confirm even at 100% score.

**Why:** Even 100% fuzzy score can be wrong (e.g., "PINK SALT CRYSTAL 1KG" barcode PN01 vs barcode PINK1 — same name, could be different suppliers/sizes). Staff judgment on MRP, brand, and stock is needed. The hover card showing product details (MRP, brand, size, stock, total sales) supports this decision-making.

### 7. Swap canonical direction in UI

**Decision:** Users can swap which barcode becomes the canonical and which becomes the alias, per suggestion.

**Why:** The clustering algorithm picks the canonical candidate heuristically (prefers barcode with an `app.products` row, then most-seen barcode). Staff may prefer a different barcode as canonical based on business knowledge (e.g., the barcode with the cleaner name, or the one printed on the shelf label).

## Consequences

- **Pipeline rebuild required after confirming aliases.** Aliases don't affect analytics until the next `derived.*` rebuild. UI shows an amber banner reminding staff.
- **Re-runnable clustering.** Each run truncates pending suggestions and re-scans. Already-confirmed aliases are skipped. New imports → new duplicates → new suggestions.
- **No raw data modification.** Aliases only affect the derived layer via LEFT JOIN + COALESCE. Raw data integrity is preserved.
- **Circular alias prevention.** The confirm endpoint checks both directions before inserting — prevents A→B and B→C chains that could break the COALESCE logic.

## Tables

| Table | Schema | Purpose |
|-------|--------|---------|
| `app.product_aliases` | app | Confirmed alias → canonical mapping (permanent) |
| `app.product_merge_suggestions` | app | Pending review queue (transient, repopulated by clustering) |

## Files

| File | Purpose |
|------|---------|
| `scripts/cluster_product_names.py` | RapidFuzz clustering script (CLI + API-triggered) |
| `api/tools/entity_resolution/` | Tool plugin (6 endpoints + product detail hover) |
| `web/components/entity-resolution/` | Review UI (suggestions + confirmed aliases) |
| `api/migrations/versions/006_product_entity_resolution.py` | Alembic migration |
| `sql/rebuild_derived/01_product_daily_metrics.sql` | Alias remapping at aggregation source |
| `sql/rebuild_derived/05_necessary_views.sql` | Alias remapping in product_dimension view |
| `sql/rebuild_derived/10_product_associations.sql` | Alias remapping for basket analysis |
