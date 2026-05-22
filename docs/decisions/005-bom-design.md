# ADR 005: BOM Manager — Design Decisions

**Status:** Accepted  
**Date:** 2026-05-23

## Context

This supermarket repackages bulk commodities (wheat, pulses, spices, dry fruits, oils) into retail units under its own brand ("PHM" — Puranic Home Made). The Er4u billing system records bulk purchases and retail sales but has no manufacturing or repackaging module. This creates incorrect stock positions, fragmented demand signals, and misleading replenishment recommendations.

See `docs/architecture/bom-manager.md` for full problem description and solution architecture.

---

## Key Decisions

### 1. Primary goal: stock accuracy, not ML signal

**Decision:** BOM Manager is designed to fix `derived.product_stock_position` first. Demand signal aggregation for ML (B1) is a downstream benefit, not the primary driver.

**Why:** Stock position is visible to staff daily via the replenishment sheet. Broken stock numbers (WHEAT FLOUR 1KG showing −5,000 kg) erode trust in the system. ML benefit is real but requires validation and model promotion — a longer feedback loop. Building for stock accuracy first means staff see results after the very next pipeline rebuild.

---

### 2. Yield-based `qty_per_unit`, not assumed 1:1

**Decision:** Every confirmed BOM requires an explicit `qty_per_unit` entered by staff. No default of 1.0.

**Why:** This store's repackaging is not simple decanting. Wheat → flour involves grinding with ~5% cleaning loss. Groundnut → oil pressing yields ~350ml per kg. Using 1:1 for oil would make stock positions worse, not better. Only staff who do the actual packaging know the true yield. The qty input field is the confirmation gate — you cannot confirm a BOM without providing this number.

**Trade-off:** Higher friction for staff than a "one-click confirm." Justified because a wrong yield factor compounds every day until someone notices.

---

### 3. `app.*` schema, consistent with entity resolution

**Decision:** `app.product_bom` lives in the `app` schema (Alembic-managed), not `derived.*`.

**Why:** Confirmed BOM mappings are permanent human decisions that must survive pipeline rebuilds. The `derived` schema is truncated on every rebuild. This follows the same rationale as `app.product_aliases` (ADR 003): `app.*` stores human-authored state, `derived.*` stores computed analytics.

---

### 4. Modify step 04 directly, not a new step

**Decision:** BOM consumption is folded into `04_product_stock_position.sql`. No new SQL step added.

**Why:** `app.*` → `derived.*` joins already exist (step 01 uses `app.product_aliases`). Having two stock position tables (`product_stock_position` and `product_stock_position_bom`) would require updating every downstream consumer (replenishment sheet, health signals, API endpoints). One table, always correct, is simpler.

**Trade-off:** Step 04 now has a dependency on `app.product_bom`. With an empty BOM table (no confirmed mappings), the BOM CTE returns zero rows — zero regression risk. The LEFT JOIN is a no-op until staff confirm their first BOM.

---

### 5. Exclude finished goods from stock tracking entirely

**Decision:** Barcodes that appear in `app.product_bom.finished_barcode` are excluded from `product_stock_position` entirely (not zeroed, not synthesized — absent).

**Why:** A finished good's stock position is meaningless without a production log. Stock is packed on-demand, and Er4u has no production event records. Synthesizing "production events" would be fabricated data. Excluding them is honest. Staff who want to know WHEAT FLOUR 1KG stock look at WHEAT LOOSE stock instead.

**Considered:** Keeping finished goods with a synthetic `pseudo_stock ≈ 0`. Rejected: if the store pre-packs batches, this would be wrong. If they pack on-demand, it's always zero — noise, not signal.

---

### 6. Auto-suggest via name parsing, not `size_raw`

**Decision:** BOM candidate detection strips size/format tokens from `item_name_raw` to find base names, then fuzzy-matches raw material base names against finished good base names. The `size_raw` column is not used.

**Why:** `size_raw` is unmaintained — 242,447 of ~260,000 rows contain `'0'`, ~15,950 are empty, ~2,000 have real values. `item_name_raw` is consistently formatted: raw materials have `LOOSE` or `IN KG` in name; finished goods have size tokens (`1KG`, `500GM`, `(PHM)`) and are absent from purchase records. This pattern covers ~95% of the catalog's repackaged products.

---

### 7. Auto-suggest reruns on every pipeline rebuild

**Decision:** `suggest_bom.py` is called at the end of `weekly_pipeline.py` on every rebuild, not just once.

**Why:** New products are ingested regularly. A product first sold today may be a repackaged variant of an existing raw material. Staff should see new suggestions the next time they open `/tools/bom-manager` after a pipeline run. The script skips already-confirmed and already-rejected pairs, so reruns are safe and cheap.

---

### 8. Score threshold 70 (not 78 like entity resolution)

**Decision:** BOM suggestions use `min_score 70`, lower than entity resolution's `78`.

**Why:** BOM matching is fundamentally different from duplicate detection. In entity resolution, "SURF EXCEL 1KG" vs "SURFEXCEL 1KG" is a same-product question — high precision required because false positives mean merging different products. In BOM, "WHEAT LOOSE" vs "WHEAT FLOUR 1KG" are intentionally different products — we're looking for related-but-different names. A broader net is appropriate. Staff must still confirm every match with a qty_per_unit — they are the precision filter.

---

## Consequences

- **Pipeline rebuild required** after confirming BOMs. UI states this clearly on the Suggestions tab.
- **Purchase data gap is a separate problem.** Raw material stock positions may still appear negative due to incomplete purchase ingestion in Er4u. BOM logic is correct; purchase coverage is an operational issue.
- **N:1 supported today, N:M deferred.** A finished good with multiple raw material inputs (e.g., mixed spice blends) would need multiple rows in `product_bom` — the schema supports this. No mixed products currently in the catalog; UI for multi-raw creation can be added when needed.
- **No auto-confirm.** Every BOM requires human confirmation with explicit qty. This is intentional — see Decision 2.

## Tables

| Table | Schema | Purpose |
|---|---|---|
| `app.product_bom` | app | Confirmed raw→finished mappings with yield factors (permanent) |
| `app.product_bom_suggestions` | app | Auto-detected candidates pending staff review (repopulated each rebuild) |

## Files

| File | Purpose |
|---|---|
| `api/migrations/versions/008_product_bom.py` | Alembic migration |
| `scripts/suggest_bom.py` | Auto-suggestion (CLI + pipeline-integrated) |
| `api/tools/bom/` | Tool plugin |
| `sql/rebuild_derived/04_product_stock_position.sql` | BOM-aware stock position |
| `web/app/(internal)/tools/bom-manager/page.tsx` | Staff review UI |
