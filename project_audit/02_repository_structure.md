# 02 — Repository Structure

Tree of every important top-level folder, with purpose, key files, and dependencies. See `10_code_health.md` for the duplicate-code and dead-file findings referenced below.

```
axonflux/
├── api/                — FastAPI backend
├── pipelines/           — batch orchestration (weekly_pipeline.py)
├── sql/                 — schema DDL + ordered derived-rebuild scripts
├── raw_ingestion/        — frozen ingestion modules (do not modify)
├── scripts/              — CLI utilities, one-off/admin scripts
├── web/                  — Next.js dashboard
├── ml/                   — demand-forecasting experimentation (Phase B1)
├── tests/                — pytest suite (23 files)
├── docs/                 — architecture docs, ADRs, session notes
├── config/, db/          — shared DB connection helpers (+ dead legacy copy)
└── project_audit/        — this audit (new)
```

## `api/` — FastAPI backend

- **`main.py`** — app factory; mounts core routers, the `agents` router, auto-discovered tool plugins, static `/uploads`, plus a few inline endpoints (`/api/ai/models`, `/api/ai/test`, `/api/tools`, `/api/health`).
- **`dependencies.py`** — `get_db()` (ORM session), `get_conn()` (raw connection), JWT auth (`get_current_user`), role lattice (`ROLE_LEVELS`, `require_staff/manager/admin`). Code comment explicitly flags the duplicated role-check needed for SSE/query-token auth paths.
- **`routers/`** — always-on core endpoints: auth, analytics, customers, products, suppliers, pipeline, docs, users.
- **`tools/`** — plugin architecture. `base.py` defines `ToolManifest`; `__init__.py`'s `_discover_tools()` auto-imports any subdir with `__init__.py` (MANIFEST) + `router.py`. Plugins: `bom/`, `campaign_studio/` (chat + asset_service + service + models — largest plugin by feature surface), `cash_closure/`, `entity_resolution/`, `pamphlets/` (largest by file count — DSL, AI session, system prompt, state).
- **`agents/`** — a *separate* LLM-agent layer from the tools plugins: `image_agent.py`, `router.py`, `tools/infra.py` (Tavily search), `tools/pamphlet_dsl.py`, `tools/pamphlet_items.py`. Mounted directly in `main.py`, not through the plugin system.
- **`ai/`** — provider-agnostic chat layer: `chat.py` (`ChatSession`), `config.py` (`ALLOWED_MODELS`, `AI_DEFAULT_PROVIDER`/`AI_DEFAULT_MODEL` env), `cost.py`, `provider.py`, `providers/{anthropic,openai}.py`.
- **`core/`** — `config.py` (pydantic Settings: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `CORS_ORIGINS`), `security.py` (JWT encode/decode).
- **`models/app.py`**, **`schemas/`** (analytics, auth, customers, products, users, common), **`storage/client.py`** (Local + R2/S3, env: `STORAGE_ENDPOINT_URL/ACCESS_KEY/SECRET_KEY/BUCKET/REGION/PUBLIC_URL`), **`lib/filters.py`** (shared cross-table filter engine).
- **`migrations/`** — Alembic; `env.py` builds its own DB URL from raw env vars (one of five duplicated DB-URL constructions in the repo, see `10_code_health.md`); 13 numbered version files.
- **Dependencies:** imports `config/db.py` for engine/session. **Depended on by:** `web/` (HTTP), `tests/test_api_*.py`, `scripts/create_admin.py`.

## `pipelines/`

- **`weekly_pipeline.py`** (only file) — orchestrates: raw ingestion (imports all 6 `raw_ingestion.*` modules) → runs 11 SQL scripts from `sql/rebuild_derived/` in order → 2 sheet SQLs → supplier-order export. Has its own `get_engine_from_env()` duplicating `config/db.py` instead of importing it. Depends on `db/db.py:run_sql_file`. **Never imported by the API** — triggered as a subprocess (see `api/routers/pipeline.py`).

## `sql/`

Execution order: `raw_tables.sql`, `derived_tables.sql` (DDL — **note:** `derived_tables.sql` is a stale bootstrap snapshot, see `03_data_layer.md`) → `rebuild_derived/00` through `10` (see `03_data_layer.md` for full table-by-table breakdown) → `sheets/{replenishment_sheet.sql, conversion_attention_sheet.sql}`. `recon_views.sql` exists standalone, outside the pipeline's file list — appears manual-run-only, worth confirming whether it's still needed or orphaned.

## `raw_ingestion/` — frozen, out of scope per CLAUDE.md

Per-report modules (`sales_itemwise.py`, `sales_billwise.py`, `purchase_itemwise.py`, `purchase_billwise.py`, `item_combinations.py`, `supplier_master.py`), each exporting `ingest()`. Shared logic in `common/`: `ingest_core.py`, `validators.py`, `header_normalizer.py`, `file_loader.py`, `batch_context.py`. **Depended on by:** `pipelines/weekly_pipeline.py`, `scripts/ingest_*.py` wrappers, `scripts/ingest_all.py`.

## `scripts/`

Real/active: `cluster_product_names.py` (B3 entity resolution), `create_admin.py`, `demo_reset.py`, `er4u_export.py` (Playwright export automation), `fetch_product_images.py` (Open Food Facts), `file_watcher.py`, `generate_demo_data.py`, `ingest_all.py` (real CLI ingestion driver), `ingest_backfill.py`, `prepare_sales_itemwise_reingest.py`, `migrate_pamphlets_to_dsl.py` (legacy migration, historical), `seed_calendar.py` (seeds `derived.calendar_dim` — **required** before step 02 of the pipeline can join it, per `03_data_layer.md`), `seed_canonical_products.py`, `setup_raw_triggers.py` (**required manual step** post-first-ingestion, see `03_data_layer.md`/`09_decisions.md`), `setup_test_db.py`, `suggest_bom.py` (B4), `ax.ps1` (PowerShell dev shortcuts).

Thin per-report wrappers (`ingest_item_combinations.py`, `ingest_purchase_billwise.py`, `ingest_purchase_itemwise.py`, `ingest_sales_billwise.py`, `ingest_sales_itemwise.py`, `ingest_supplier_master.py`): 8–9 lines each, call the matching `raw_ingestion` module but **hardcode a sample file path** with real CLI arg-parsing commented out — dev scaffolding, not production entrypoints (see `10_code_health.md`).

**Dead/empty (0 bytes):** `ingest_file.py`, `ingest_folder.py`, `run_pipeline.py` — orphaned stubs superseded by `ingest_all.py`.

## `web/` — Next.js, App Router

Route groups: `(auth)/login`, `(internal)/{academy, customers, dashboard, docs, products, settings, tools}`. `tools/` mirrors the backend plugin set 1:1 (bom-manager, campaign-studio, cash-closure, entity-resolution, pamphlet-generator). `academy/` is the largest single content area (architecture, deep-dive, features, graph, interview, library, path, rebuild, roadmap, topics). `app/api/chat-proxy/` — Next.js API route proxying long-running AI chat to work around a 30s rewrite timeout. Supporting: `components/`, `hooks/`, `lib/`, `types/`, `public/`. Full detail in `05_frontend_status.md`.

## `ml/`

`train.py`, `predict.py` — each independently rebuilds a DB URL from env vars (a 3rd/4th copy of the same duplicated pattern, see `10_code_health.md`). `notebooks/`: `01_baseline` → `02_feature_engineering` → `03_xgboost_demand` → `04_evaluation`. Separate `requirements.txt` (xgboost, scikit-learn, shap, mlflow, jupyter/ipykernel). **Orphan:** a stray duplicate `ml/notebooks/ml/mlflow.db` alongside the top-level `ml/mlflow.db`, suggesting MLflow was run from two different working directories at some point.

## `tests/`

23 files, 2,492 lines. `conftest.py` + `test_agents_dsl`, `test_agents_infra`, `test_ai_config`, `test_ai_module`, `test_api_analytics`, `test_api_auth`, `test_api_bom`, `test_api_customers`, `test_api_users`, `test_campaign_studio`, `test_db`, `test_dependencies_roles`, `test_filters`, `test_image_agent`, `test_ingestion`, `test_insert`, `test_pamphlet_ai_tools`, `test_pamphlet_models_smoke`, `test_pamphlet_primitives`, `test_pamphlet_render_html`, `test_pamphlet_sanitize`, `test_pipeline_step04`, `test_role_constraint`, `test_storage`. Coverage skews heavily toward `pamphlets` (5 files) and auth/roles (3 files); **no dedicated test files for `campaign_studio` service internals** (only one shallow test), **none for `cash_closure` or `entity_resolution`** despite both being shipped, staff-facing tools with real business consequences (money handling, product-identity merges).

## `docs/`

`architecture/` (7 docs), `decisions/` (6 ADRs), `reviews/`, `setup/` (demo-data, docker, git-strategy, local-development), `superpowers/{plans,specs}`, plus loose top-level informal changelog files (`phase1_complete.md`, `phase2_complete.md`, `phase_a_complete.md`, session notes, `understanding-map.html`) — not indexed anywhere, discoverable only by browsing. Full detail in `09_decisions.md` and `08_learning_system.md`.

## `config/`, `db/` — shared DB helpers

`config/db.py` is the real, actively-used engine/session module. `config/legacydb.py` is a **fully orphaned duplicate** (zero importers repo-wide) — it re-implements both `config/db.py`'s engine setup *and* `db/db.py`'s `DB` class, bound to a `raw_models` module, with a much larger dynamic-filter query API. `config/settings.py` is a 0-byte unused stub (distinct from the real `api/core/config.py`). See `10_code_health.md` for cleanup recommendation.

## Root Config & Tech Stack

- **`requirements.txt`**: FastAPI `0.135.3`, Starlette `1.0.0`, SQLAlchemy `2.0.45` (plus a redundant duplicate lowercase `sqlalchemy>=2.0.0` pin), Alembic ≥1.13, Anthropic SDK ≥0.40, OpenAI ≥1.30, boto3, playwright, bleach/lxml (pamphlet HTML rendering/sanitizing), pandas/openpyxl.
  **⚠ Verify:** FastAPI `0.135.x` / Starlette `1.0.0` do not correspond to any published PyPI release as of this writing — this may be a typo'd or vendored pin and should be checked against the actual installed environment, not assumed correct from the file alone.
- **`web/package.json`**: Next.js `16.2.3`, React `19.2.4`, Tailwind `^4`, shadcn `^4.2.0`, recharts, framer-motion, `@react-pdf/renderer`, `pdfjs-dist`.
- **`ml/requirements.txt`**: separate env (xgboost, mlflow, shap).
- **`alembic.ini`** + `api/migrations/env.py`: DB URL built from raw, non-namespaced env vars `user/password/host/port/dbname` — collision-prone naming, duplicated across 5 files (see `10_code_health.md`).
- **Env vars observed:** `user, password, host, port, dbname` (6+ files), `AXONFLUX_INCOMING_DIR`/`INCOMING_DIR`, `SECRET_KEY`, `ADMIN_USERNAME/PASSWORD`, `STORAGE_ENDPOINT_URL/ACCESS_KEY/SECRET_KEY/BUCKET/REGION/PUBLIC_URL`, `AI_DEFAULT_PROVIDER/MODEL`, `TAVILY_API_KEY`, `ER4U_URL/USERNAME/PASSWORD/EXPORT_DAYS`.
