# 04 — API Layer

FastAPI app in `api/`. Auth is JWT. Two DB dependency patterns are used consistently: `get_db()` (`api/dependencies.py:19`) gives an ORM `Session` for `app.*` writes; `get_conn()` (`:32`) gives a raw read-only `Connection` for `derived.*`/`raw.*` analytics reads. Routers that both read and write (products, bom, entity_resolution) correctly mix both per-endpoint.

**No stub or placeholder endpoints were found anywhere in the codebase.** Every route below has a real implementation. "Status" is included for completeness per the requested format, but in practice every row is **Implemented**.

## RBAC — `api/dependencies.py`

`ROLE_LEVELS = {staff:1, manager:2, admin:3}` (`:62`). `assert_min_role()` (`:65`) does a numeric floor check → 403 on failure. `require_role(minimum)` (`:83`) is a guard factory producing pre-built `require_staff`/`require_manager`/`require_admin` dependencies (`:95-97`). A missing `role` claim resolves to level 0 — fail-closed by default, no silent fallback. Two endpoints can't use header-based JWT (browser `EventSource` can't set headers) and duplicate the same check via query-token auth: `api/agents/router.py:38` and `api/tools/pamphlets/router.py:593`.

## Tool Plugin Auto-Discovery

`api/tools/__init__.py` walks `api/tools/*/`, finds every dir with `__init__.py` (declaring a `MANIFEST`) + `router.py`, and mounts it. `ToolManifest` = id/name/description/icon/tags — deliberately **no role field**; role enforcement lives in each router's own `Depends`, not the manifest. Discovered plugins:

| id | name | tags |
|---|---|---|
| bom | BOM Manager | inventory, stock |
| campaign-studio | Campaign Studio | marketing, campaigns, design |
| cash-closure | Cash Closure | finance, daily-ops |
| entity-resolution | Entity Resolution | data-quality, products |
| pamphlets | Pamphlet Generator | marketing, print |

**Mount note:** `api/agents/router.py` (image-scan agent for pamphlet products) is hand-mounted directly in `main.py`, outside the plugin system — it's a legacy/utility router, not a "tool" in the staff-facing sense. All 8 `api/routers/*.py` files are explicitly mounted; no orphaned routers found in either direction.

---

## `api/routers/auth.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| POST /api/auth/login | Password login, issues JWT | none | Implemented |

## `api/routers/analytics.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET /summary | Dashboard KPI cards | staff | Implemented |
| GET /daily-revenue | Revenue time series | staff | Implemented |
| GET /daily-payments | Payment-mode breakdown | staff | Implemented |
| GET /daily-purchases | Purchase time series | staff | Implemented |
| GET /health-signals | Fast/slow/dead/spike product list | staff | Implemented |
| GET /health-export | CSV export of health signals | staff | Implemented |
| GET /supplier-export | Per-supplier CSV report | staff | Implemented |
| GET /replenishment | Restock recommendations | staff | Implemented |
| GET /top-products | Top N by revenue/qty | staff | Implemented |
| GET /demand-trend/{barcode} | Per-product demand chart | staff | Implemented |

## `api/routers/customers.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET / | Paginated customer list | staff | Implemented |
| GET /summary | Customer KPI aggregate | staff | Implemented |
| GET /lapsed | Churn-tier filtered list (at-risk/lapsed/lost) | staff | Implemented |
| GET /lapsed/export | CSV/XLSX export | staff | Implemented |
| GET /{mobile}/history | Bill history for a customer | staff | Implemented |

## `api/routers/products.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET /search | Fast name/barcode search | staff | Implemented |
| GET / | Paginated product catalog | staff | Implemented |
| POST /bulk-categorize | Batch category update | staff | Implemented |
| GET /{barcode}/recommendations | Frequently-bought-together | staff | Implemented |
| GET /{barcode} | Product detail | staff | Implemented |
| POST /{barcode}/image | Upload product image (→ StorageClient) | staff | Implemented |
| PATCH /{barcode} | Edit canonical name/category/brand | staff | Implemented |

## `api/routers/suppliers.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET / | Supplier list w/ lead times | staff | Implemented |
| GET /{supplier_name}/restock | Restock list for a supplier | staff | Implemented |

## `api/routers/pipeline.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| POST /full-refresh | Export → ingest → rebuild, backgrounded | manager | Implemented |
| POST /trigger | Rebuild-only pipeline run | manager | Implemented |
| GET /status/latest | Latest run status | staff | Implemented |
| GET /status/{run_id} | Specific run status | staff | Implemented |
| GET /status | Recent runs list | staff | Implemented |
| POST /{run_id}/cancel | Kill running subprocess | manager | Implemented |
| GET /last-data-date | Data freshness check | staff | Implemented |

## `api/routers/users.py` (admin user management, RBAC A4)

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET / | List users | admin | Implemented |
| POST / | Create user | admin | Implemented |
| PATCH /{user_id} | Edit/deactivate user | admin | Implemented (guards self-role-change and self-deactivate) |

## `api/routers/docs.py` (feeds Academy "Library" tab)

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET / | List markdown docs | staff | Implemented |
| GET /{category}/{slug} | Fetch doc content | staff | Implemented |

## `api/agents/router.py` (mounted directly, not a tools/ plugin — image-scan utility agent)

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| POST /image/scan-all/{pamphlet_id} | Bulk AI image-scan for pamphlet items | staff | Implemented |
| POST /image/scan-one/{pamphlet_id}/{item_id} | Single-item image scan | staff | Implemented |
| GET /tasks/{task_id}/stream | SSE progress stream | staff (query-token) | Implemented |
| GET /tasks/{task_id} | Polling fallback for SSE | staff | Implemented |

## `api/tools/bom/router.py` — BOM Manager

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET /suggestions | RapidFuzz BOM suggestions, grouped | staff | Implemented |
| POST /confirm | Confirm raw→finished mapping | staff | Implemented |
| POST /reject | Reject suggestion | staff | Implemented |
| GET /mappings | List confirmed mappings | staff | Implemented |
| PATCH /mappings/{id} | Edit mapping | staff | Implemented |
| DELETE /mappings/{id} | Delete mapping | staff | Implemented |
| POST /manual | Manual BOM entry (no suggestion) | staff | Implemented |
| GET /product-search | Barcode/name search for manual entry | staff | Implemented |

## `api/tools/cash_closure/router.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| POST / | Submit HOTO closure (upsert) | staff | Implemented |
| PUT /draft | Save draft | staff | Implemented |
| GET /date/{date} | Fetch by date | staff | Implemented |
| GET / | List closures | staff | Implemented |
| GET /{id} | Get one closure | staff | Implemented |
| PATCH /{id}/verify | Manager verify/reject | manager | Implemented |

## `api/tools/entity_resolution/router.py`

| Method + Path | Purpose | Role | Status |
|---|---|---|---|
| GET /suggestions | Duplicate-barcode clusters | staff | Implemented |
| POST /confirm | Merge alias into canonical | manager | Implemented |
| POST /reject | Reject suggestion | manager | Implemented |
| GET /aliases | List confirmed aliases | staff | Implemented |
| DELETE /aliases/{barcode} | Remove alias | admin | Implemented |
| GET /product/{barcode} | Hover-preview detail | staff | Implemented |
| POST /recompute | Re-run RapidFuzz clustering script (subprocess) | admin | Implemented |

## `api/tools/campaign_studio/router.py` — 30 endpoints, all `require_staff`

Groups: Campaigns CRUD + duplicate; Campaign Products CRUD, bulk-add, import-from-pamphlet; Designs CRUD + duplicate; Design Versions list/restore; Chat get/clear/send (AI-driven DSL editing via `apply_dsl_patch` — swallows chat-history save errors non-fatally, worth noting as a soft failure mode); Preview render; Export PDF/PNG/as-pamphlet; Campaign asset upload + Asset Library CRUD + per-campaign asset attach. All fully implemented.

## `api/tools/pamphlets/router.py` — 21 endpoints, all `require_staff` except `preview-html` (query-token auth)

Groups: List/create/get/patch/delete; models list (hardcodes display-name labels for `ALLOWED_MODELS` — a model added there without a matching label just falls back to showing the raw id, not a bug but a maintenance gap); items add/update/remove + AI image-scan trigger; apply-changes / node-content-update / purge-orphaned-nodes (DSL surgery helpers); duplicate; import-gsheet; AI highlights; chat (AI DSL editing, validates render before persisting — a hardening fix from `[[project_b3...]]`-era work); versions list/restore; export-pdf/export-image; preview-html.

---

## Summary Table

| Router / Tool | Endpoint Count | Role Floor | Implementation Status |
|---|---|---|---|
| auth | 1 | none | 100% implemented |
| analytics | 10 | staff | 100% implemented |
| customers | 5 | staff | 100% implemented |
| products | 7 | staff | 100% implemented |
| suppliers | 2 | staff | 100% implemented |
| pipeline | 7 | manager (writes) / staff (reads) | 100% implemented |
| users | 3 | admin | 100% implemented |
| docs | 2 | staff | 100% implemented |
| agents (image-scan) | 4 | staff | 100% implemented |
| bom (tool) | 8 | staff | 100% implemented |
| cash_closure (tool) | 6 | staff / manager (verify) | 100% implemented |
| entity_resolution (tool) | 7 | staff / manager / admin | 100% implemented |
| campaign_studio (tool) | 30 | staff | 100% implemented |
| pamphlets (tool) | 21 | staff | 100% implemented |
| **Total** | **~113** | | |

Not yet built (per roadmap, no endpoints exist): Phase C4 RAG chatbot, C5 decision engine briefing, any Phase D agent-runs API, Phase E MCP server, Phase F storefront public API.
