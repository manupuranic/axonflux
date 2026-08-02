# 10 — Code Health

Overall assessment: **healthy for a solo-owner project at this stage.** No stub/placeholder endpoints anywhere, consistent architectural patterns (tool plugins, get_db/get_conn split, RBAC guard factory), a real test baseline. The issues below are real but mostly low-severity — the kind that accumulate in any actively-shipping codebase, not signs of rot.

## Code Quality

- Naming, dependency-injection, and router organization are consistent across the entire `api/` tree — every tool plugin follows the same `MANIFEST` + `router.py` shape, every router follows the same `get_db()`/`get_conn()` split. This consistency is the single biggest asset for AI-assisted future work: a new agent/endpoint can be built by pattern-matching an existing one with high confidence.
- No stub/TODO/placeholder endpoints found anywhere (confirmed across all ~113 endpoints in `04_api_layer.md`) — unusual and good for a project this size; most codebases at this stage have at least a few "coming soon" routes.
- Two soft failure modes worth tightening, not urgent: Campaign Studio's chat endpoint swallows chat-history save errors non-fatally (`api/tools/campaign_studio/router.py`), and the pamphlets `list_models` endpoint silently falls back to a raw model id if a model is added to `ALLOWED_MODELS` without a matching display-name label.

## Folder Organization

Clean three-layer separation (raw/derived/app) mirrored consistently in code, docs, and tests. The one structural wrinkle: `api/agents/` (LLM vision/DSL agents, hand-mounted in `main.py`) and `api/tools/*` (staff-tool plugins, auto-discovered) are **two different extension mechanisms living side by side**. This is defensible today (agents aren't staff-facing tools with their own nav entry) but is worth an explicit ADR before Phase D adds 7 more agents — otherwise it's unclear which new agentic code should go where.

## Technical Debt

1. **DB URL construction duplicated across 5 files**: `config/db.py`, `config/legacydb.py`, `pipelines/weekly_pipeline.py`, `api/migrations/env.py`, `ml/train.py`/`ml/predict.py` each independently rebuild `postgresql+psycopg2://user:pass@host:port/db` from the same lowercase, non-namespaced env vars (`user`, `password`, `host`, `port`, `dbname`) instead of importing the one real helper (`config/db.py`). Low risk today (values are consistent), but a credential rotation or connection-pooling change now requires editing 5 places instead of 1.
2. **`config/legacydb.py` is fully orphaned** — zero importers repo-wide. It duplicates both `config/db.py`'s engine setup and `db/db.py`'s `DB` class (bound to a `raw_models` module that itself may be legacy), plus a much larger dynamic-filter query API not used anywhere else. Safe deletion candidate — verify zero imports one more time, then remove.
3. **`config/settings.py` is a 0-byte unused stub**, distinct from the real settings module (`api/core/config.py`). Likely leftover from an earlier config approach. Safe deletion candidate.
4. **Three 0-byte orphaned scripts**: `scripts/ingest_file.py`, `scripts/ingest_folder.py`, `scripts/run_pipeline.py` — superseded by `scripts/ingest_all.py`, never cleaned up.
5. **Per-report ingest CLI wrappers hardcode sample file paths** with real CLI arg-parsing commented out (e.g. `scripts/ingest_sales_itemwise.py`) — these look like dev scaffolding that was never finished into real CLI tools. Either finish them (uncomment + wire argparse) or delete them in favor of `ingest_all.py`, which is the actual production path.
6. **Stray duplicate MLflow store**: `ml/notebooks/ml/mlflow.db` sitting alongside the real `ml/mlflow.db` — evidence MLflow was run from two different working directories at some point. Low risk (it's a local tracking DB, not shared state) but worth deleting to avoid confusion about which one is authoritative.
7. **`sql/derived_tables.sql` has drifted from the live `sql/rebuild_derived/*` pipeline** (see `03_data_layer.md` for the three specific schema differences found). This is the highest-priority item on this list to actually fix — anyone bootstrapping a fresh database per CLAUDE.md's own documented setup path will get a schema that doesn't match what the pipeline actually produces on first rebuild.
8. **Dead/duplicate migration**: `012_product_image_url` re-adds a column that already existed since migration `001`, guarded only by `IF NOT EXISTS`. Harmless but confusing — a reader tracing when `image_url` was added will get the wrong answer.
9. **`api/models/__init__.py` under-exports** models that exist in `api/models/app.py` (`product_aliases`/`product_merge_suggestions` ORM models are defined but not re-exported) — minor, likely dead-code-adjacent, worth a quick check for whether anything actually needed the export and silently fell back to raw SQL instead.
10. **`recon_views.sql`** exists in `sql/` outside the pipeline's ordered file list — unclear if it's still needed, run manually, or an orphan. Needs a quick owner check, not a guess.
11. **Requirements pin oddity**: `requirements.txt` lists FastAPI `0.135.3` / Starlette `1.0.0`, which don't correspond to published PyPI releases as of this writing. Worth confirming this against the actual installed venv (`pip freeze`) rather than trusting the pin file — could be a typo that happens to still resolve to something installable, or could indicate the file is out of sync with what's actually running.

## Duplicate Code

Beyond the DB-URL duplication (item 1 above), no significant logic duplication was found — the tool-plugin pattern and shared `filters.py`/`ingest_core.py` helpers are doing their job of centralizing common logic. This is a well-factored codebase in that respect.

## Test Coverage Gaps

- **No dedicated tests for `cash_closure` or `entity_resolution`** despite both being shipped, staff-facing tools with real business consequences (money reconciliation, product-identity merges that affect all downstream analytics). This is the most concrete, actionable test-coverage gap.
- **`campaign_studio`** — the largest, most complex tool in the codebase (30 endpoints, AI chat, DSL mutation) — has only one shallow test file. Given it's flagged internally as a possible "identity" project (see `07_current_roadmap.md`), it's under-tested relative to its importance.
- Test coverage otherwise skews toward `pamphlets` (5 files) and auth/roles (3 files) — reflecting where past bugs/hardening work concentrated (see the `set_theme` provider-wiring saga in `07_current_roadmap.md`), not necessarily where risk is highest today.

## What Should Be Refactored Before AI Features (Phase D+)

In priority order:

1. **Fix the `derived_tables.sql` vs `rebuild_derived/*` drift** (item 7 above) — any agent that reasons about "the schema" from a stale bootstrap file will be wrong in ways that are hard to detect.
2. **Consolidate DB URL construction into one import everywhere** (item 1) — before adding agent code that will need its own DB access pattern, don't let it become a 6th independent copy.
3. **Decide and document where agent code lives** — `api/agents/` vs `api/tools/` — before Phase D adds 7 more agents into whichever bucket seems convenient at the time.
4. **Build the shared `agent_runs`/`agent_outputs` scaffold once** (detailed in `06_ai_readiness.md`) rather than letting each of the 7 planned agents invent its own ad-hoc audit pattern — this is a code-health decision as much as a data-layer one, since inconsistent per-agent audit logging is exactly the kind of duplication this codebase has otherwise avoided.
5. Clean up the clearly-dead files (`config/legacydb.py`, `config/settings.py`, the three 0-byte scripts, the stray mlflow.db) — cheap, low-risk, removes noise before more people/agents read this codebase.
6. Add test coverage for `cash_closure` and `entity_resolution` before building agents that will read from or reason about their output (a Cash Discrepancy Agent reading untested cash-closure logic is building on an unverified foundation).
