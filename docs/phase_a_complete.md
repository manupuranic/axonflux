# Phase A — Operational Completeness ✅

Completed: April 2026

## A1 — Cash Closure UI

Daily EOD cash reconciliation tool for store staff.

**Frontend**: `/tools/cash-closure`
- Date picker → loads system totals from `derived.daily_payment_breakdown`
- Physical count entry grid (cash denominations)
- Live delta (system vs physical)
- Submit for manager review → `app.cash_closure_records`
- Manager can verify or reject with notes

**Backend**: `api/tools/cash_closure/` (was already complete)

---

## A2 — Daily Ingestion + Refresh Button

Unblocks same-day analytics use (previously required weekly manual pipeline run).

**Er4u automation**: `scripts/er4u_export.py`
- Playwright-based headless browser script
- Logs into Er4u billing portal, downloads latest sales export
- Drops file into `data/incoming/` for the ingestion pipeline
- Fix: replaced `wait_for_url(lambda)` with glob string — Python 3.13 IOCP crash on Windows

**API**: `POST /api/pipeline/trigger?run_ingestion=true`
- Triggers full pipeline with ingestion step enabled

**Dashboard**: "Refresh Data" button in pipeline trigger modal

---

## A3 — Pamphlet Generator

Client-side PDF pamphlet builder for monthly offer promotions.

### Stack
- `@react-pdf/renderer` — PDF generation in browser (no server PDF bytes, no storage)
- `pdfjs-dist` — PDF → canvas rendering for PNG export (CDN worker → unpkg)
- `Geist-Bold.ttf` / `Geist-Regular.ttf` — custom fonts in `/public/fonts/` (supports ₹)
- `Claude Haiku` — AI-generated marketing copy per product

### Features
- Product search from LedgerAI catalog + custom products (no barcode)
- Per-item: display name override, MRP, offer price, image URL, highlight badge
- AI Copy button → bulk-generates highlight text for all items
- Compact list view with search filter, edit modal (no inline card expansion)
- PDF preview (A4 landscape, configurable rows × cols grid)
- Download: PDF / PNG per page / PNG all pages merged
- Duplicate pamphlet, delete pamphlet
- Import from Google Sheets (paste any Sheets URL — auto-converted to CSV export)

### Key files
| File | Purpose |
|------|---------|
| `api/tools/pamphlets/router.py` | CRUD + AI + import endpoints |
| `api/tools/pamphlets/ai.py` | Claude Haiku integration |
| `api/tools/pamphlets/service.py` | DB operations + GSheet import logic |
| `api/migrations/versions/005_pamphlet_layout.py` | rows, cols, image_url, nullable barcode |
| `web/components/pamphlet/PamphletPDFTemplate.tsx` | react-pdf Document component |
| `web/lib/pamphlet-export.ts` | downloadPDF / downloadPNGPerPage / downloadPNGMerged |
| `web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx` | Builder page |

### Font decision
react-pdf cannot composite multiple subset font files (unlike CSS `unicode-range`). Only the
last registered weight wins. Helvetica (built-in) and LiberationSans (pdfjs-dist) both lack
₹ (U+20B9). Roboto subset files have ₹ only in `latin-ext` which has no digits.

Solution: Geist-Regular.ttf + Geist-Bold.ttf from Vercel's `geist` npm package — single
complete TTF files verified via fontkit to have all required glyphs.
