# 11 — Recommended Next Milestone

*One milestone. No future planning beyond it.*

## Milestone: Agent Runtime Foundation + First Agent (Weekly Intelligence Agent)

### Why this, not B1 (ML Forecasting) or jumping straight into Phase D's full 7-agent roster

Three facts converge on this recommendation:

1. **The roadmap says the frontier is B1 (ML demand forecasting)**, but B1 is the single hardest, most open-ended item in the entire roadmap — it requires an actually-validated model beating a real baseline, which is genuine ML-engineering uncertainty, not scoped plumbing work (see `06_ai_readiness.md`, Forecast Agent). It's a poor choice for "next milestone" because its completion criteria aren't fully in the owner's control — the model might just not beat WMA on the first few attempts.
2. **The data layer is already sufficient for at least 2-3 agents** (Information, Inventory, Purchase Planner, Marketing per `06_ai_readiness.md`) — the actual blocker across all of Phase D is a **missing shared scaffold**, not missing data. Building 7 agents' worth of bespoke audit/approval logic before validating the pattern once would repeat this codebase's one real anti-pattern (the 5x-duplicated DB-URL construction, see `10_code_health.md`) at a much larger, agentic scale.
3. **The most recent actual engineering sessions were Campaign Studio hardening**, not roadmap-phase work (see `07_current_roadmap.md`) — this is fine and normal, but it means "next milestone" should be chosen freshly against what's true today, not assumed from a roadmap document that lags real work.

### Scope

1. **One migration**: `app.agent_runs` (id, agent_name, triggered_by, status, started_at, completed_at, output_summary) + `app.agent_outputs` (id, run_id FK, output_type, payload JSONB, created_at). This single migration unblocks every future agent's audit trail at once — the highest-leverage, lowest-risk piece of work available right now.
2. **One generalized approval-queue UI pattern**, extracted from the existing Cash Closure verify/reject flow (already proven in production) rather than invented fresh — a reusable component/route pattern any future agent's output review screen can reuse.
3. **One agent, end to end: the Weekly Intelligence Agent.** Chosen because (a) it's sequential, not parallel-fan-out, making it the simplest orchestration shape to get right first; (b) it composes entirely from already-shipped, already-tested read endpoints (`analytics/summary`, `analytics/health-signals`, `customers/lapsed`, cash closure status) — zero new data-layer work required; (c) its output (a one-screen weekly report) is immediately useful to the owner even in a minimal first version, unlike e.g. a draft-PO agent whose value depends on trusting its supplier-fan-out logic first.
4. **Do not** build the other 6 Phase D agents yet. Do not start C1/C3/C4 (content generation, embeddings, RAG) — none are needed for this milestone and starting them now would spread effort across three unfinished threads instead of proving one pattern completely.

### Definition of Done

- Migration applied, both tables exist and are exercised by at least one real write.
- Weekly Intelligence Agent runnable on demand (staff-triggered, per the "all agents are staff-triggered or scheduled" rule), producing a real report from real store data, logged into `agent_runs`/`agent_outputs`.
- A human (owner or manager) can view the agent's output and explicitly approve/dismiss it via the generalized approval-queue UI — proving the "read-only + suggest, human approves" rule end-to-end, not just as a stated policy.
- At least one test file covering the new agent-runs data layer (matching this codebase's existing test-baseline standard, not left as the untested gap that `cash_closure`/`entity_resolution` currently are).

### What This Sets Up

Once this milestone lands, every subsequent Phase D agent (Reorder, Dead Stock Clearance, Cash Discrepancy, Supplier Performance, Pamphlet Intelligence) becomes "reuse the scaffold, write the domain-specific query/prompt" — not "invent agent infrastructure again." B1's ML model, once validated, plugs into the same `agent_outputs` pattern for its predictions rather than needing its own bespoke audit story. This is the same shape as this codebase's best existing decisions (tool-plugin auto-discovery, RBAC guard factory): build the abstraction once, well, before the thing that needs seven copies of it exists.
