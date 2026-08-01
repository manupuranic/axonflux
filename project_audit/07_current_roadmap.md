# 07 — Combined Roadmap, TODOs, Milestones, Decisions

This file merges every roadmap fragment found across `CLAUDE.md`, session memory (`.remember/`), and persistent auto-memory (`C:\Users\Manu\.claude\projects\...\memory\`) into one chronological/structural view. It is the single most information-dense file in this audit — treat it as the primary context-recovery document.

## Master Phase Roadmap (source: CLAUDE.md)

### Phase A — Operational Completeness — ✅ COMPLETE
- **A1** Cash Closure UI — nightly EOD cash count, delta calc, manager verify/reject — ✅
- **A2** Daily Ingestion + Refresh Button — `POST /api/pipeline/trigger?run_ingestion=true`, Playwright-based Er4u export automation — ✅
- **A3** Pamphlet Generator (superseded by A3.5) — catalog search, AI highlight copy, client-side PDF — ✅
- **A3.5** Pamphlet DSL v2 + Campaign Studio — server-side DSL renderer, AI chat w/ 6 tools + `apply_dsl_patch`, format-as-data multi-format canvas, theme engine hardening (see below) — ✅
- **A4** Role-Based Access Control — 3-role lattice, migration 013, full endpoint audit, admin user-management UI — ✅

### Phase B — ML Upgrade — 🔶 IN PROGRESS
- **B1** ML Demand Forecasting — **NOT DONE**. `ml/` scaffolded, notebooks 01→04 exist, MLflow WMA baseline logged, migration 007 (`app.ml_demand_predictions`) exists. Missing: a validated XGBoost model that actually beats the WMA baseline, and wiring the predict step into `weekly_pipeline.py`. This is the single open item blocking Phase B closure.
- **B2** Basket Analysis / Recommendation Engine — ✅ (`derived.product_associations`, 30,018 pairs, "Frequently Bought Together" UI)
- **B3** Product Entity Resolution — ✅ (RapidFuzz clustering, `--min-score 78` — see `[[project_b3_entity_resolution]]`, staff review UI, `app.product_aliases`)
- **B4** BOM Manager — ✅ (in-house repackaging/kitting, 792 auto-suggestions)
- **B5** Test Baseline — ✅ (6-file suite, persistent `axonflux_test` DB)

### Phase C — AI / Retail Co-pilot — 🔶 BARELY STARTED
- **C1** Product Content Generation (LLM) — **NOT DONE**. Needs new `app.products` columns (`description`, `tags`, `use_cases`, `diseases_cured`, `key_benefits`) and `scripts/generate_product_content.py`.
- **C2** Storage Abstraction + Product Images — ✅ (`StorageClient` ABC, Local + R2, migration 012)
- **C3** Embedding Pipeline + pgvector — **NOT DONE**
- **C4** RAG Chatbot — **NOT DONE**
- **C5** "What should I do today?" Decision Engine — **NOT DONE**

### Phase D — Agentic Intelligence — 📋 DESIGNED ONLY, ZERO CODE
7-agent roster fully specified on paper (see `01_project_overview.md` and `09_decisions.md` for detail): Reorder Agent, Weekly Intelligence Agent, Dead Stock Clearance Agent, Pamphlet Intelligence Agent, Cash Discrepancy Agent, Supplier Performance Agent, Storefront Agent Group (D7, 4 sub-agents), Content Writer Agent (D8). Hard rule: **all agents read-only + suggest, human approves**. New tables needed: `app.agent_runs`, `app.agent_outputs`, `app.blog_posts` — none exist.

### Phase E — MCP Server — 📋 DESIGNED ONLY, ZERO CODE
Read-only MCP server for **Manastra** (owner's separate personal-OS project at `D:\projects\Manastra`). Six planned tools: `daily_summary`, `stock_alerts`, `lapsed_customers`, `cash_status`, `health_signals`, `weekly_report`. Hard rule: no writes via MCP, no customer PII (mobile numbers never leave AxonFlux).

### Phase F — Puranic Storefront — 📋 DESIGNED ONLY, ZERO CODE
Public site at puranic.in, brand "Puranic" ("Freshness, crafted daily"). Same repo, separate Vercel project, static export of `app/(public)/` only. Depends on C2 (done) + D7 + D8 (not done). Full sitemap and SEO strategy already specified in CLAUDE.md.

---

## Recent Session Activity (source: `.remember/now.md`, today 2026-08-02)

All from `main` branch, all Campaign Studio UI/bug-fix work — **not** roadmap-phase work:
- 14:59 — Campaign edit dialog (title/type/objective/status/valid-until) + design rename shipped in `[id]/page.tsx`
- 15:07 — Resizable chat panel + markdown rendering (tables/bold/lists) added to design edit chat; fixed `set_theme` tool auth by threading provider/model through `PamphletState` and call sites
- 15:18 — Fixed `set_theme` model error: replaced hardcoded `haiku` (missing from OpenRouter) with `fable-5` across `pamphlet_dsl.py`, `image_agent.py`, `config.py`, `router.py`, `ai-settings.ts`
- 15:23 — Switched Fable→Sonnet 5 per OpenRouter check; hardened system prompts (`campaign_studio/chat.py`, `pamphlets/system_prompt.py`) to validate tool results before claiming success
- 15:32 — Shipped card badge/price color overrides via `style_region()`; enhanced `set_theme` with a validation helper; 26/26 tests passing

**Implication for context recovery:** the roadmap document (CLAUDE.md) says the frontier is B1/ML. The actual last engineering sessions were entirely Campaign Studio reliability/UX hardening. Both are true simultaneously — CLAUDE.md is updated in batches (via the `update-progress` skill) and does not track every session. An AI picking up this project should ask the user which thread to pull before assuming either is "the" current priority.

## Recent Weekly Summary (source: `.remember/archive.md`)

- **Week of 2026-07-20**: Campaign Studio product-query fix (PamphletItem→CampaignProduct table injection). AxonFlux Academy launched (6-phase roadmap, 24-file content library). RBAC Phase A4 finalized (228 tests, merged to main).
- **Week of 2026-06-08**: B1 demand prediction — global XGBoost model implemented, output table `derived.demand_predictions` (note: possible naming drift vs `app.ml_demand_predictions` from migration 007 — worth verifying which name is authoritative, see `03_data_layer.md`). WMA baseline notebook planned for MAE comparison.
- **Week of 2026-05-26**: Campaign Studio Phases 1–5 shipped (7-table schema, 29 endpoints, 3-panel canvas, AI chat, bulk product mgmt, `apply_dsl_patch`). Pamphlet export finalized. B5 test baseline finalized. R2 integration live (12/12 tests). BOM/product-mgmt tools. Supply-chain 7-agent architecture designed.
- **Week of 2026-05-19**: Pamphlet DSL finalized (26 tests, 3 regressions noted — unclear if since fixed, worth checking). SQL perf optimized 700ms→55ms. Puranic storefront finalized on paper (8-page sitemap). MLflow WMA baseline OOM fixed (SQL pushdown, 2.9M→392K rows). AxonFlux mobile access via Tailscale. BOM Manager completed (792 auto-suggestions).

## Identity / Positioning Notes (source: `.remember/recent.md`)

Three "identity candidates" the owner has flagged as potentially portfolio/resume-defining work:
1. Campaign Studio DSL + multi-panel editor — flexible design-authoring system
2. Agentic DSL mutation system (`apply_dsl_patch`, JSON-repair, format-as-data) — core abstraction for AI-driven document generation
3. AxonFlux 7-agent agentic orchestration (demand intelligence, entity resolution, ML forecasting, MCP server, storage abstraction) — full-stack + data + ML + agentic AI engineering for supply-chain systems

## Open Threads / Unresolved Items Worth Flagging to ChatGPT

- B1 ML model: which table name is current — `derived.demand_predictions` (June memory) or `app.ml_demand_predictions` (migration 007, per CLAUDE.md)? Needs a code check, not an assumption.
- Pamphlet DSL "3 regressions noted" (2026-05-19) — status unknown, not mentioned as fixed in later notes.
- `set_theme` model-slug bug had **three** sequential fix attempts in one day (haiku→fable-5→Sonnet 5) before landing — a live example of provider/model configuration being fragile in this codebase; any future AI touching AI-provider wiring should treat the current Sonnet 5 config as unstable until proven otherwise in production use.
- No `app.agent_runs` / `app.agent_outputs` / `app.blog_posts` tables exist yet — Phase D cannot start without a migration first.
- Memory system flags an active background "consolidation" of 1 day of memory at session start — its output isn't visible in this audit and may add facts not captured here.

See `09_decisions.md` for ADR-level detail behind these decisions, and `11_next_milestone.md` for a single recommended next step reconciling roadmap-vs-actual.
