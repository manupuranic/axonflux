# 01 — Project Overview

## What is AxonFlux?

AxonFlux is a **raw-first analytics platform** built for a single supermarket whose billing software (a legacy POS system, "Er4u") has no API. Staff manually export sales, purchase, and supplier data as CSV/XLS files. AxonFlux ingests those exports, keeps an **immutable raw data layer** as the single source of truth, rebuilds **fully-disposable derived analytics tables** from it on demand, and exposes everything through a FastAPI backend + Next.js dashboard used by store staff, a manager, and the owner.

It is a solo-owner-operated project (owner: Manu) that has evolved from "give the store basic dashboards" into a staged plan toward an **agentic AI co-pilot for retail operations**, and eventually a public-facing storefront ("Puranic") built on the same data spine.

## Vision

Turn a paper-and-spreadsheet supermarket business into a data-driven operation without ever asking staff to change how they work (they still export files the same way). Every layer above the raw exports — analytics, dashboards, ML forecasting, AI agents, public storefront — is disposable and rebuildable, so mistakes in derived logic are never data-loss events.

Long-term vision (per CLAUDE.md roadmap, Phases C–F):
- An AI retail co-pilot that can answer "what should I do today?" using real store data (RAG + decision engine)
- A multi-agent system (reorder planning, dead-stock clearance, supplier performance, pamphlet/marketing suggestions, cash discrepancy detection) that is **read-only + suggest**, never autonomous-write
- An MCP server exposing read-only tools to **Manastra**, the owner's separate personal-intelligence-OS project, for daily briefings and anomaly alerts
- A public storefront (puranic.in) statically generated from the same product/offer data, with zero customer PII ever leaving the private system

## End Goal

A fully closed loop: manual file export → immutable raw storage → rebuildable analytics → human dashboards → AI agents that read the analytics and suggest actions (restock, pricing, marketing, clearance) → human approval → (optionally) public storefront reflecting curated products/offers. The owner should be able to ask natural-language questions about the business and get grounded, numeric answers sourced from real data, not hallucination.

## Current Architecture

Three strictly-separated Postgres schemas in one database (`axonflux`):

| Schema | Mutability | Purpose |
|---|---|---|
| `raw.*` | Append-only, never UPDATE/DELETE | Source of truth: sales/purchase itemwise & billwise, supplier master, item combinations, ingestion batch audit log. SHA-256 file dedup. |
| `derived.*` | Fully truncated + rebuilt every pipeline run | Analytics: daily aggregates, dense product time series, rolling features, health signals (fast/slow/dead/spike), pseudo-stock position, supplier restock recs, payment breakdown, customer dimension/metrics, product associations (basket analysis). Never stores app state — anything here disappears on rebuild. |
| `app.*` | Alembic-migrated, persistent | Human/application state that must survive pipeline rebuilds: users (RBAC), canonical products, pipeline run audit, cash closure records, pamphlets, campaign studio, product aliases/merge suggestions, ML prediction outputs. |

Application layer:
- **FastAPI** backend (`api/`) — JWT auth, role-gated routers, a **tool plugin system** for internal staff tools (auto-discovered, no `main.py` edits needed), never imports the pipeline directly (runs it as a subprocess)
- **Next.js dashboard** (`web/`) — staff/manager/admin facing UI, protected routes, an internal "Academy" learning portal
- **Pipeline** (`pipelines/weekly_pipeline.py`) — orchestrates the 10-step SQL rebuild of `derived.*`, optionally runs ingestion first
- **ML** (`ml/`) — experimentation area for replacing the SQL weighted-moving-average demand forecast with a validated XGBoost model; not yet wired into the pipeline

The governing architectural rule, repeated throughout the codebase and docs: **the raw layer is never modified, the derived layer is always rebuildable.** This single invariant is what makes the whole system safe to iterate on aggressively — a bad SQL change in `derived/` is a five-minute fix, not a data-recovery incident.

## Current Milestone

Per CLAUDE.md, **Phase A (Operational Completeness) is marked complete**, including RBAC (A4). **Phase B (ML Upgrade)** is in progress: B1 (ML demand forecasting) is the one open item — everything else in B is shipped (basket analysis, entity resolution, BOM manager, test baseline). Phase C (AI/Retail Co-pilot) has one item shipped (C2 storage abstraction) and the rest (C1 content generation, C3 embeddings, C4 RAG chatbot, C5 decision engine) not yet started. Phases D (agentic), E (MCP server), F (public storefront) are designed on paper but not implemented.

Session buffer memory (`.remember/now.md`) shows the most recent work was **not** on the ML/agent roadmap — it was UI polish on Campaign Studio (campaign edit dialog, resizable AI chat panel, markdown rendering) and a provider/model wiring bug fix for the `set_theme` AI tool (a hardcoded, since-dead OpenRouter model slug was silently breaking sub-agent tool calls). This suggests the roadmap's stated "current milestone" (B1 ML forecasting) and the *actual* most recent engineering attention (Campaign Studio hardening) have diverged — worth flagging explicitly to any AI picking up this project, since roadmap documents lag real work by design (they're updated in batches via the `update-progress` skill, not continuously).

## What Has Been Completed

- Full raw/derived/app three-schema architecture, 10-step derived rebuild pipeline
- 6-report-type ingestion with SHA-256 dedup (ingestion code itself is explicitly frozen/out-of-scope)
- FastAPI backend: JWT auth, RBAC (3-role lattice: staff/manager/admin), analytics/customers/products/suppliers/pipeline routers
- Tool plugin system with 3 shipped tools: cash closure, pamphlet generator (superseded by DSL v2), Campaign Studio
- Campaign Studio: DSL-based canvas editor (16 node types), AI chat with 6 composable tools + universal `apply_dsl_patch` mutation tool, multi-format export (A4/A5/WhatsApp/Instagram/Facebook), theme engine
- Next.js dashboard: KPI cards, charts, Product Health / Replenishment / Customers pages, pipeline trigger, Academy learning portal
- ML: basket analysis (product associations via SQL self-join), product entity resolution (RapidFuzz clustering + staff review UI), BOM manager (repackaging/kitting), 6-file test baseline against a persistent test DB
- Storage abstraction (`StorageClient` ABC: local + Cloudflare R2) with product image upload

## What Is Still Missing

- **B1**: validated ML demand model beating the SQL WMA baseline, and wiring the predict step into `weekly_pipeline.py`
- All of Phase C except storage: product content generation (LLM), pgvector embeddings, RAG chatbot, daily decision-engine briefing
- All of Phase D: the 7-agent orchestration layer (reorder, weekly intelligence, dead-stock clearance, pamphlet intelligence, cash discrepancy, supplier performance, storefront group, content writer) — designed on paper, zero code
- Phase E: MCP server for Manastra integration
- Phase F: public storefront (puranic.in) — needs C2 (done) + D7 + D8 (not done) as prerequisites
- `app.products` columns needed for storefront/content phases: `description`, `tags`, `use_cases`, `diseases_cured`, `key_benefits`, `is_featured`, `storefront_slug`, `seo_title`, `seo_description`, `schema_org_json` — none of these exist yet
- New `app.*` tables needed for agents: `agent_runs`, `agent_outputs`, `blog_posts` — none exist yet

## Major Technical Decisions Already Taken

1. **Raw/derived/app three-schema separation**, with derived fully rebuildable and never holding app state.
   *Why:* the billing system is a black box with no API — the only trustworthy data is exactly what was exported. Keeping raw immutable means any analytics bug is fixable by re-running SQL, never by data recovery. This is the single load-bearing decision in the whole architecture.

2. **`derived.*` objects that require heavy CTEs are TABLEs, not VIEWs** (see `[[feedback_derived_view_vs_table]]` in memory — e.g. `product_dimension` saw a 12x perf win moving from view to table). *Why:* the pipeline rebuild is a natural, free materialization point — no reason to recompute a heavy view on every read when it only needs to be correct as of the last pipeline run.

3. **Pipeline runs as a subprocess from the API, never imported.** *Why:* keeps the long-running, potentially-crashing batch job process-isolated from the always-up API process; `pipeline_runs` table gives an audit trail without coupling failure domains.

4. **Auto-discovered tool plugin system** (`api/tools/<name>/` with `MANIFEST` + `router.py`, no `main.py` edits). *Why:* internal staff tools (cash closure, pamphlets, campaign studio) are numerous and grow independently — this avoids a central registration file becoming a merge-conflict/coupling hotspot.

5. **RBAC as a linear lattice** (`staff(1) < manager(2) < admin(3)`) via a single `require_role()` factory, not a permission-matrix/ACL system. *Why:* the domain genuinely is hierarchical (three humans, three trust levels) — a lattice is the simplest model that's actually true, and adding a role is a one-line dict change.

6. **Agents are read-only + suggest, human approves, forever** (explicit rule for all of Phase D). *Why:* this is a real business with real inventory and real money; an agent silently placing a wrong purchase order or discounting the wrong product is an unacceptable failure mode. This is a safety/trust decision, not a technical one.

7. **Format-as-data, not format-as-code-branch**, for Campaign Studio (A4/A5/WhatsApp/Instagram/Facebook are rows in a table, not separate code paths). *Why:* avoids N-way code duplication every time a new export format is added; the DSL renderer is format-agnostic.

8. **Public storefront is the same repo, separate Vercel project, static export only** — internal dashboard never leaves local/Tailscale. *Why:* zero customer PII must ever reach the public internet; static export from a pipeline-produced JSON snapshot is the only path that can't leak live DB access to the public side by accident.

9. **No customer PII in any external-facing surface** (MCP tools return counts only, mobile numbers never leave AxonFlux; storefront gets zero customer data). *Why:* stated explicitly in the Phase E section — this is a hard boundary, not a default that got missed.
