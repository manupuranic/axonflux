# BOM Manager — Architecture

## The Problem

This supermarket buys commodity goods in bulk (loose) and repackages them in-house for retail sale. Examples:

- **WHEAT LOOSE IN KG'S** → ground into **WHEAT FLOUR 1KG**, **WHEAT FLOUR 2KG**, **WHEAT FLOUR LOOSE**
- **GROUNDNUTS LOOSE** → repacked as **GROUND NUT 500GM**, **GROUND NUT 1KG**
- **JAGGERY LOOSE** → repacked as **JAGGERY BALLS 1KG**, **JAGGERY POWDER 1KG**
- **TOOR DAL LOOSE** → repacked as **TOOR DAL 1KG**, **TOOR DAL 500GM**

The billing system (Er4u) has no manufacturing or repackaging module. It only records purchases of raw materials and sales of finished goods. There is no "production event" record.

This creates three data problems:

**1. Stock position is wrong.** `derived.product_stock_position` computes `pseudo_stock = cumulative_purchased - cumulative_sold` per barcode. For WHEAT LOOSE, it only deducts direct loose-wheat sales — not the kilograms consumed when making flour packets. WHEAT LOOSE appears to have vastly more stock than it does. Meanwhile WHEAT FLOUR 1KG has zero purchases, so its pseudo-stock is always deeply negative.

**2. Demand signal is fragmented.** True wheat demand is the sum of loose-wheat sales plus all flour-packet sales (converted back to raw-material equivalents). The ML pipeline sees three sparse signals instead of one strong one.

**3. Replenishment sheet is misleading.** WHEAT FLOUR 1KG shows negative stock and no supplier → confusing to staff. It shouldn't appear in stock tracking at all.

---

## The Discovery Challenge

`size_raw` in the raw tables is not maintained — 242,447 rows contain `'0'`, only ~2,000 rows have real values. Detection must rely entirely on `item_name_raw`.

Data investigation confirmed two clean patterns:

| Pattern | Meaning |
|---|---|
| `item_name_raw ILIKE '%LOOSE%'` + present in purchases | Raw material |
| Name contains size token (`1KG`, `500GM`, `250G`, `1L`, `(PHM)`) + **absent** from purchases | Finished good (repackaged) |

`(PHM)` = "Puranic Home Made" — the store's own branded packaged products.

---

## Solution: `app.product_bom`

A Bill of Materials table storing confirmed raw→finished relationships with yield-based conversion factors. Staff enters the actual quantity of raw material consumed per unit of finished product — not assumed 1:1, because processes like grinding (wheat → flour, ~5% loss) and pressing (groundnuts → oil, ~35% yield) have real yield factors.

### Schema

```sql
app.product_bom
  id               UUID PRIMARY KEY
  raw_barcode      TEXT                -- e.g. WHL (WHEAT LOOSE)
  finished_barcode TEXT                -- e.g. AD15 (WHEAT FLOUR 1KG)
  qty_per_unit     NUMERIC(10,4)       -- kg/L of raw per 1 finished unit
  notes            TEXT                -- e.g. "5% cleaning loss"
  confirmed_by     UUID REFERENCES app.users(id)
  confirmed_at     TIMESTAMPTZ
  UNIQUE (raw_barcode, finished_barcode)

app.product_bom_suggestions
  id               UUID PRIMARY KEY
  raw_barcode      TEXT
  raw_name         TEXT
  finished_barcode TEXT
  finished_name    TEXT
  similarity_score NUMERIC(5,2)        -- RapidFuzz token_sort_ratio
  status           TEXT                -- 'pending' | 'confirmed' | 'rejected'
  generated_at     TIMESTAMPTZ
  UNIQUE (raw_barcode, finished_barcode)
```

The schema supports N:1 naturally — a finished good can have multiple raw material rows (e.g., a mixed spice packet containing turmeric + chili). Currently all relationships in this store are 1:N (one raw, many finished goods).

---

## Auto-Suggestion Script (`scripts/suggest_bom.py`)

Runs at the end of every pipeline rebuild. Algorithm:

1. Query raw material candidates: barcodes with `LOOSE` or `IN KG` in name that appear in `raw_purchase_itemwise`
2. Query finished good candidates: barcodes with size tokens in name that appear in sales but **never** in purchases
3. Normalize both names by stripping size/format tokens (`LOOSE`, `1KG`, `500GM`, `(PHM)`, etc.) → base name
4. RapidFuzz `token_sort_ratio` between all raw base names and finished base names
5. Insert pairs scoring ≥ 70 into `product_bom_suggestions` as `'pending'`
6. Skip pairs already confirmed or rejected — confirmed BOMs are permanent

Discovery results on this catalog: **792 candidate pairs**, top scores are 100% (e.g., `HESARU BELE LOOSE` → `HESARU BELE 500GM`).

```bash
# Dry-run to inspect candidates without writing to DB
PYTHONPATH=. python scripts/suggest_bom.py --dry-run --min-score 70

# Write suggestions (default, runs in pipeline)
PYTHONPATH=. python scripts/suggest_bom.py --min-score 70
```

---

## Staff Workflow (`/tools/bom-manager`)

**Three tabs:**

### Suggestions tab
Grouped by raw material (collapsible cards). Each suggested finished good has a qty/unit input field. **Entering a qty and clicking Confirm is the only confirmation mechanism** — there is no "confirm without qty". This ensures every BOM has a real yield factor, not a default.

### Active BOMs tab
All confirmed mappings, searchable, grouped by raw material. Qty/unit is editable inline (click to edit). Deletable.

### Add Manually tab
Product search (by name) for both raw and finished product. For cases the auto-suggest missed.

---

## Pipeline Integration

`04_product_stock_position.sql` was modified to:

**1. Compute daily BOM consumption per raw material:**
```sql
bom_daily AS (
    SELECT
        pdm.date,
        b.raw_barcode                                          AS product_id,
        SUM(COALESCE(pdm.quantity_sold, 0) * b.qty_per_unit)  AS bom_consumed
    FROM derived.product_daily_metrics pdm
    JOIN app.product_bom b ON b.finished_barcode = pdm.product_id
    GROUP BY pdm.date, b.raw_barcode
)
```

**2. Exclude finished goods from stock tracking entirely:**
```sql
excluded_finished AS (
    SELECT DISTINCT finished_barcode AS product_id FROM app.product_bom
)
-- Main query filters: WHERE product_id NOT IN (SELECT product_id FROM excluded_finished)
```

**3. Corrected pseudo-stock formula:**
```
pseudo_stock = cumulative_purchased - cumulative_direct_sold - cumulative_bom_consumed
```

The new `total_bom_consumed` column is exposed in `product_stock_position` for transparency.

---

## Data Flow

```
raw.raw_purchase_itemwise  ─────────────────────────────────────────┐
raw.raw_sales_itemwise     ──→  scripts/suggest_bom.py  ──→  app.product_bom_suggestions
                                                                      │
                                                              Staff review UI
                                                              (enter qty_per_unit)
                                                                      │
                                                            app.product_bom
                                                                      │
                                                            Pipeline rebuild
                                                                      │
                               04_product_stock_position.sql (BOM-aware)
                                  ├── raw material: stock = bought - sold - bom_consumed
                                  └── finished goods: excluded entirely
```

---

## Known Limitation: Purchase Data Gap

Discovery showed a 12x discrepancy between purchased and sold quantities for raw materials (e.g., WHEAT LOOSE: 6,120 kg purchased vs 74,530 kg sold). This is **incomplete purchase ingestion** — not all supplier invoices are being exported from Er4u and ingested. The BOM logic is correct, but raw material stock positions will remain negative until purchase data coverage improves. This is a separate operational problem.

---

## API Endpoints

All prefixed with `/api/tools/bom/`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/suggestions?status=pending` | Suggestions grouped by raw barcode |
| POST | `/confirm` | Confirm pair + enter qty (requires qty_per_unit > 0) |
| POST | `/reject` | Reject suggestion |
| GET | `/mappings` | All confirmed BOMs |
| PATCH | `/mappings/{id}` | Update qty_per_unit or notes |
| DELETE | `/mappings/{id}` | Remove BOM mapping |
| POST | `/manual` | Create BOM without a suggestion |
| GET | `/product-search?q=` | Product name search for manual creation |

## Files

| File | Purpose |
|---|---|
| `api/migrations/versions/008_product_bom.py` | Alembic migration (tables + indexes) |
| `scripts/suggest_bom.py` | Auto-suggestion script (runs in pipeline) |
| `api/tools/bom/` | Tool plugin (router, schemas) |
| `sql/rebuild_derived/04_product_stock_position.sql` | BOM-aware stock position |
| `web/app/(internal)/tools/bom-manager/page.tsx` | Staff review UI |
| `pipelines/weekly_pipeline.py` | Calls `suggest_bom.run()` after step 09 |
