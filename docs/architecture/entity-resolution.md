# Entity Resolution — Architecture

## Problem

Billing software exports assign different barcodes to the same physical product. Example: "SURF EXCEL 1KG" appears as barcode `SE1KG`, `SURF1`, and `8901030`. Without resolution, analytics treats these as three separate products — splitting sales history, health signals, stock tracking, and basket analysis.

## How It Works

### 1. Clustering (offline)

`scripts/cluster_product_names.py` scans all barcodes and finds fuzzy name matches:

```
Barcode SE1KG  → "SURF EXCEL 1KG"
Barcode SURF1  → "Surf Excel 1 Kg"
Barcode 890103 → "SURFEXCEL1KG"
```

**Algorithm:**
1. Fetch latest `item_name_raw` per barcode from `raw.raw_item_combinations`
2. Normalize: uppercase, fix unit spacing (`1KG` → `1 KG`, `500ML` → `500 ML`)
3. Block by (first 3 chars + numeric token) to avoid O(N^2) comparisons
4. Within each block: `rapidfuzz.process.cdist` with `token_sort_ratio` scorer
5. Extract pairs with score >= threshold, build clusters via Union-Find
6. Pick canonical candidate per cluster (prefer barcode with `app.products` row)
7. Write to `app.product_merge_suggestions`

**CLI:**
```bash
# Production (green-tier only, recommended)
PYTHONPATH=. python scripts/cluster_product_names.py --min-score 78

# Include yellow-tier for manual review
PYTHONPATH=. python scripts/cluster_product_names.py --min-score 62

# Preview without writing to DB
PYTHONPATH=. python scripts/cluster_product_names.py --min-score 78 --dry-run
```

### 2. Staff Review (UI)

At `/tools/entity-resolution`:

- Each cluster shows two barcode boxes: "Merge this" → "Into this"
- Hover the (i) icon on any barcode to see MRP, brand, size, stock, sales history
- Click swap (↔) to change which barcode becomes canonical
- Confirm (✓) writes to `app.product_aliases`
- Reject (✗) marks suggestion as rejected (won't reappear)

### 3. Pipeline Integration

On pipeline rebuild, alias remapping happens at two levels:

**Level 1 — Aggregation source** (`01_product_daily_metrics.sql`):
```sql
alias_map AS (
    SELECT alias_barcode, canonical_barcode FROM app.product_aliases
)
-- In each CTE:
LEFT JOIN alias_map al ON barcode = al.alias_barcode
COALESCE(al.canonical_barcode, barcode) AS product_id
```

This means all downstream tables automatically consolidate:
- `product_daily_features` (rolling averages)
- `product_health_signals` (fast/slow/dead)
- `product_stock_position` (pseudo-stock)
- `supplier_restock_recommendations`

**Level 2 — Dimension view** (`05_necessary_views.sql`):
```sql
-- product_dimension view also remaps, catching any direct raw queries
```

**Level 3 — Basket analysis** (`10_product_associations.sql`):
```sql
-- item_bills and pairs CTEs remap before the self-join on bill_no
```

### 4. Data Flow

```
raw.raw_item_combinations ──→ cluster_product_names.py ──→ app.product_merge_suggestions
                                                                    │
                                                            Staff review (UI)
                                                                    │
                                                          app.product_aliases
                                                                    │
                                                          Pipeline rebuild
                                                                    │
                                              derived.product_daily_metrics (consolidated)
                                                                    │
                                              All downstream derived tables
```

## Limitations

1. **Name-based only.** Products with completely different names across barcodes won't be caught. Manual identification needed for those.
2. **Blocking reduces recall.** Products in different prefix+numeric blocks aren't compared. "SURF EXCEL 1KG" won't match "WASHING POWDER SURF 1KG".
3. **No auto-merge.** Every suggestion requires human confirmation, even at 100% score.
4. **Rebuild required.** Confirmed aliases don't take effect until the next pipeline rebuild.

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/suggestions` | user | Pending clusters (grouped) |
| POST | `/confirm` | user | Confirm alias → canonical mapping |
| POST | `/reject` | user | Reject suggestion |
| GET | `/aliases` | user | Paginated confirmed aliases |
| DELETE | `/aliases/{barcode}` | admin | Undo alias (reverts to pending) |
| POST | `/recompute` | admin | Re-run clustering script |
| GET | `/product/{barcode}` | user | Product detail for hover preview |

All endpoints prefixed with `/api/tools/entity-resolution/`.

## Score Interpretation

| Range | Tier | Meaning | Default action |
|-------|------|---------|----------------|
| 78–100% | Green | Very likely same product | Shown by default, "Confirm All" available |
| 62–77% | Yellow | Possibly same product | Hidden by default (often false positives) |
| < 62% | — | Not compared | Below threshold |

Threshold calibrated on this specific supermarket's catalog. 62–77 range in this data is mostly same-brand-different-product (e.g., BARNYARD NOODLES vs BARNYARD VERMICELLI).
