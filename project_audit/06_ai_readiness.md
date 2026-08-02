# 06 — AI Readiness Assessment

For each future AI capability named in the AxonFlux roadmap (or implied by it): required data, current readiness, missing tables, missing APIs, missing architecture, and estimated implementation difficulty. Readiness % reflects **data + API + architecture readiness combined**, not "could an LLM technically attempt this" — a capability can be 0% ready even if the underlying analytics exist, if there's no agent-runtime/audit scaffolding to run it safely.

---

## 1. Information Agent
*("What's selling well?", "Show me dead stock in the herbals category" — read-only Q&A over existing analytics)*

- **Required data:** `derived.product_dimension`, `product_health_signals`, `product_daily_metrics` — all exist.
- **Readiness: 55%**
- **Missing tables:** none for basic numeric Q&A. Product `description`/`tags` (C1) needed for semantic/qualitative questions.
- **Missing APIs:** no single "ask a question" endpoint — would need a new endpoint that takes NL query → tool-calls into existing analytics endpoints → returns grounded answer.
- **Missing architecture:** a tool-calling loop (LLM + function definitions over existing `analytics`/`products` endpoints). This is the *simplest* agent to build because it can reuse 100% of existing read endpoints as tools — no new SQL needed.
- **Difficulty: Low.** This is the natural first agent to build — it validates the tool-calling pattern with zero new data-layer work.

## 2. Analytics Agent
*(Deeper than Information Agent — trend analysis, anomaly explanation, "why did revenue drop last Tuesday?")*

- **Required data:** same as above + `daily_sales_summary`, `daily_payment_breakdown`.
- **Readiness: 45%**
- **Missing tables:** none.
- **Missing APIs:** none for data access; missing an orchestration endpoint.
- **Missing architecture:** requires multi-step reasoning (compare periods, correlate signals) — closer to the Weekly Intelligence Agent design already on paper in Phase D. No code yet.
- **Difficulty: Medium.** Data is fully there; the gap is entirely in the agent-orchestration layer, which doesn't exist for any agent yet.

## 3. Inventory Agent
*(Stock position awareness, expiry/dead-stock flags, BOM-aware consumption)*

- **Required data:** `derived.product_stock_position`, `app.product_bom`, `product_health_signals`.
- **Readiness: 60%** — highest of all agents, because BOM Manager (B4) already solved the hardest part (repackaging-aware stock math).
- **Missing tables:** none.
- **Missing APIs:** none for reads; would benefit from a dedicated `/api/inventory/summary` rollup rather than composing from 3 endpoints, but not blocking.
- **Missing architecture:** agent-runs audit table (see below) to log its suggestions.
- **Difficulty: Low-Medium.**

## 4. Forecast Agent
*(Demand prediction, "what will we sell next week?")*

- **Required data:** `derived.product_daily_features` (rolling stats) is production-quality; `app.ml_demand_predictions` table exists (migration 007) but **the model that populates it isn't validated or wired into the pipeline yet** — this is literally Phase B1, the one open item in Phase B.
- **Readiness: 35%**
- **Missing tables:** none — table exists, empty/unpopulated in practice until B1 ships.
- **Missing APIs:** `demand-trend/{barcode}` exists and currently serves the SQL WMA, not ML predictions — will need updating once B1 ships.
- **Missing architecture:** the actual trained model + a promotion path from notebook → `weekly_pipeline.py` predict step. This is pure ML work, not agent-architecture work.
- **Difficulty: Medium-High** (this is the one item that's genuinely ML-engineering-hard, not just plumbing — model validation against a real baseline is the blocker, per B1's own roadmap note).

## 5. Purchase Planner
*(Draft POs per supplier — the "Reorder Agent" from Phase D)*

- **Required data:** `derived.supplier_restock_recommendations`, supplier lead times (`derived.supplier_location`), `app.product_bom`.
- **Readiness: 50%** — analytics fully exist; agent scaffolding doesn't.
- **Missing tables:** `app.agent_runs`, `app.agent_outputs` (to store draft POs for human review — this agent is explicitly "suggest only," so its output needs somewhere durable to live pending approval).
- **Missing APIs:** no endpoint to trigger the agent, none to list/approve/reject its draft outputs.
- **Missing architecture:** parallel-per-supplier fan-out orchestration (designed on paper in CLAUDE.md Phase D table), plus the approval-queue UI pattern this project doesn't have yet anywhere (cash closure's verify/reject flow is the closest existing precedent and should be reused, not reinvented).
- **Difficulty: Medium.** All the hard data work (restock recommendations, lead times) is done; what's missing is architecture that's genuinely novel to this codebase (multi-agent fan-out + approval queue), not just more SQL.

## 6. Marketing Agent
*(Pamphlet Intelligence Agent — suggest products for next campaign based on demand + expiry + basket data)*

- **Required data:** `product_health_signals`, `product_associations` (basket), campaign studio's existing product model.
- **Readiness: 40%**
- **Missing tables:** `agent_runs`/`agent_outputs` as above.
- **Missing APIs:** none for reads; the "Suggest Products" button is explicitly named in CLAUDE.md's Phase D table as the intended UI surface (Campaign Studio Phase 5) — not yet built.
- **Missing architecture:** parallel fan-out + ranking logic. Closest existing precedent: Campaign Studio's `apply_dsl_patch` tool pattern already demonstrates the "AI mutates structured state" pattern this agent would extend.
- **Difficulty: Medium.** Campaign Studio's AI chat infrastructure (tool-calling, DSL mutation) is directly reusable — this agent has more existing scaffolding to build on than any other in Phase D.

## 7. Memory Agent
*(Cross-session context, conversation memory — the "Conversation Memory" Academy topic)*

- **Required data:** none currently exists — would need a persisted conversation/context store.
- **Readiness: 10%**
- **Missing tables:** a conversation-memory table (doesn't exist; Campaign Studio's `campaign_chat_messages` / pamphlet's `pamphlet_chat_messages` are the closest analogues but are scoped per-document, not a general memory store).
- **Missing APIs:** none.
- **Missing architecture:** entirely unbuilt. Note this overlaps conceptually with Manastra (the owner's separate personal-intelligence-OS project) — worth explicitly deciding whether "memory" for AxonFlux agents should live in AxonFlux at all, or whether Manastra is the intended long-term-memory layer and AxonFlux stays stateless per Phase E's "read-only, no writes" MCP boundary.
- **Difficulty: Medium**, mostly because the *design decision* (where does memory live — AxonFlux or Manastra?) is unresolved, not because the engineering is hard.

## 8. Vision Agent
*(Image understanding — product photos, receipt/invoice scanning)*

- **Required data:** `app.products.image_url` exists (C2 storage abstraction); `api/agents/router.py`'s image-scan endpoints already do **some** AI vision work today (bulk/single image scan for pamphlet items).
- **Readiness: 30%** — higher than expected because a real vision-agent precedent already ships in production (the pamphlet image-scan agent), even though it's narrowly scoped to one tool.
- **Missing tables:** none for the existing narrow use case; a general vision-agent would need its own output/audit table.
- **Missing APIs:** the existing `/image/scan-all`, `/image/scan-one` endpoints are pamphlet-specific, not general-purpose.
- **Missing architecture:** generalizing the existing image-scan pattern beyond pamphlets (e.g., to receipt OCR, or general product-photo quality checks) hasn't been designed anywhere in the roadmap.
- **Difficulty: Low-Medium** — there's a working, shipped precedent to extend rather than invent from scratch.

## 9. Voice Agent
*(Voice interface — not mentioned anywhere in CLAUDE.md's roadmap)*

- **Required data:** N/A.
- **Readiness: 0%**
- **Missing tables:** N/A.
- **Missing APIs:** N/A.
- **Missing architecture:** completely absent from every roadmap document, ADR, and Academy topic list surveyed. This is not a documented near-term goal for this project.
- **Difficulty: Unestimated** — no design exists to estimate against. Flag to the user/architect: confirm whether this is actually wanted before scoping it, since nothing in the current roadmap implies it.

## 10. Multi-Agent Coordinator
*(Orchestrates the 7-agent Phase D roster; also relevant to the Storefront Agent Group's coordinator + 4 sub-agents pattern)*

- **Required data:** depends on whichever agents it coordinates — inherits their readiness gaps.
- **Readiness: 15%**
- **Missing tables:** `agent_runs`/`agent_outputs` — this is the single shared blocker for **every** Phase D agent, and is therefore the highest-leverage missing piece in the entire AI-readiness picture.
- **Missing APIs:** no orchestration-trigger endpoint, no run-status endpoint, no approval-queue endpoint.
- **Missing architecture:** the coordinator pattern itself (sequential pipeline vs. parallel fan-out vs. coordinator+sub-agents) is specified per-agent in CLAUDE.md's Phase D table but has zero code. The "Weekly Intelligence Agent" (sequential: sales → stock alerts → lapsed customers → cash status → report) is the best first coordinator to build, since it composes entirely from already-shipped read endpoints with no new data dependencies.
- **Difficulty: High** — this is the architectural linchpin. Building it well once (generic run/audit/approval scaffolding) makes every other agent in this list cheaper; building it poorly (bespoke per-agent) multiplies effort 7x.

---

## Overall Verdict

The **data layer is more ready than the architecture layer** across the board. Every numeric-analytics agent (Information, Analytics, Inventory, Purchase Planner, Marketing) is blocked primarily by the **absence of a shared agent-runtime scaffold** (`app.agent_runs`, `app.agent_outputs`, a generic approval-queue UI pattern), not by missing source data. Only the Forecast Agent (blocked on B1's actual ML validation) and Memory/Vision/Voice agents (blocked on unresolved design questions, not missing plumbing) fall outside that pattern.

**Recommended build order if starting Phase D today:**
1. `app.agent_runs` + `app.agent_outputs` migration (unblocks everything below)
2. Generic approval-queue UI component, generalized from the existing Cash Closure verify/reject pattern (avoids reinventing it 7 times)
3. Weekly Intelligence Agent (sequential, zero new data deps, cheapest to prove the pattern end-to-end)
4. Information Agent (validates tool-calling loop reusing existing endpoints)
5. Everything else, now that the scaffold and two agent-shapes (sequential pipeline, tool-calling loop) both have a working reference implementation
