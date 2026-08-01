# 12 — Questions for the Next AI Architect

These are open questions this audit could not resolve from static code/doc analysis alone — either because they require a live-system check, a business/product decision only the owner can make, or because the audit surfaced a genuine contradiction between two sources. Organized by theme. Answering these before touching Phase D/C code will prevent the most likely context-loss mistakes.

## A. Data Layer — Verification Needed Against the Live Database

1. Has `scripts/setup_raw_triggers.py` actually been run on the current production database? (It's a manual, non-Alembic-tracked step — there's no automated way to confirm this from code alone.)
2. Does `derived.calendar_dim` currently exist in production, and was it seeded via `scripts/seed_calendar.py`? Step 02 of the rebuild pipeline silently depends on this table existing.
3. Is `sql/derived_tables.sql`'s drift from the live `sql/rebuild_derived/*` pipeline (three specific schema differences found, see `03_data_layer.md`) purely theoretical, or has it ever actually caused a bootstrap failure? Should this file be regenerated, or deleted in favor of "just run the pipeline once on an empty schema"?
4. What's the actual current row count / table size for the largest `derived.*` tables in production today (beyond the ~2.3M cited for `product_daily_metrics`)? This matters directly for sizing any future pgvector index (Phase C3) and for whether "truncate + rebuild everything" stays viable as data grows.
5. Confirm the FastAPI `0.135.3` / Starlette `1.0.0` pins in `requirements.txt` against `pip freeze` in the actual venv — these version strings don't match any published PyPI release found during this audit.
6. Is `sql/recon_views.sql` still needed? It exists outside the pipeline's ordered file list with no clear caller.

## B. Roadmap vs. Reality — Reconciling Contradictions Found

7. CLAUDE.md's roadmap names B1 (ML demand forecasting) as the current frontier, but the most recent session logs (`.remember/now.md`, 2026-08-02) show a full day of Campaign Studio UI/provider-wiring work instead. Which thread does the owner actually want an AI architect to pick up next — and should CLAUDE.md's roadmap be updated to reflect that Campaign Studio hardening is an active, ongoing thread alongside the phase-lettered roadmap, not separate from it?
8. Memory notes from 2026-06-08 mention a table called `derived.demand_predictions`; the actual migration (007) creates `app.ml_demand_predictions`. This audit treats the migration as authoritative, but confirm there isn't a second, undocumented table or a renamed intermediate state.
9. `docs/superpowers/specs/2026-07-26-a4-rbac-design.md`'s header still says "Approved (pending user spec review)" while the corresponding ADR and `roadmap.ts` both mark RBAC as shipped/done. Is this just a forgotten status-line update, or is there unresolved review feedback on the RBAC design that hasn't been folded back into the spec?
10. The 2026-05-19 memory note mentions "3 regressions noted" in the Pamphlet DSL after that ship. No later note confirms these were fixed. Were they, and if not, are they still live bugs today?
11. `set_theme`'s model-slug bug required three sequential fixes in one day (hardcoded haiku → fable-5 → Sonnet 5) before landing. Is the current Sonnet 5 configuration confirmed stable in production use since, or should it still be treated as provisional?

## C. Architecture Decisions Only the Owner Can Make

12. `api/agents/` (hand-mounted LLM agents) and `api/tools/*` (auto-discovered staff-tool plugins) are two parallel extension mechanisms. Before Phase D adds 7 more agents: should they live under `api/agents/`, become `api/tools/` plugins (even though they're not staff-facing UI tools in the traditional sense), or does Phase D warrant a *third* mechanism (e.g. `api/agents/phase_d/` with its own manifest concept)?
13. Where should "Memory Agent" state actually live — inside AxonFlux, or is Manastra (the owner's separate personal-intelligence-OS project) the intended long-term-memory layer, with AxonFlux staying stateless per Phase E's "read-only, no writes" MCP boundary? This is unresolved in every document surveyed.
14. Voice Agent appears nowhere in CLAUDE.md, the Academy roadmap, or any ADR — is this an actual near-term goal, or should it be dropped from consideration entirely until explicitly requested?
15. Should the frontend's `GET /api/tools` discovery endpoint (built, unused) actually drive the Sidebar nav dynamically, replacing the current static `links` array — or was that decision deliberately reversed and the endpoint should be considered dead/for external consumers only (e.g. a future MCP client)?
16. Is single-store the permanent scope, or is "scaling to 50 stores" (currently only an Academy interview-prep question, not a real design doc) something that should get an actual ADR before any more `app.*`/`derived.*` tables are added without a `store_id` column? Retrofitting multi-tenancy after Phase D's 7 agents exist would be significantly more expensive than deciding now.

## D. Agent Safety & Approval Flow — Needs Concrete Design Before Phase D Code

17. The "read-only + suggest, human approves" rule is stated as an absolute for every Phase D agent — but no approval-queue UI pattern exists yet anywhere except Cash Closure's verify/reject flow. Should that be formally generalized into a reusable component (this audit's `11_next_milestone.md` recommends this), or does each agent warrant a bespoke review UI given how different their outputs are (a draft PO vs. a ranked clearance list vs. a blog post draft)?
18. What does "approve" actually mean per agent — is it always a binary accept/reject, or do some agents (e.g. Reorder Agent's draft PO) need an edit-then-approve flow? This changes the `agent_outputs` schema design materially (immutable suggestion vs. editable draft).
19. Who is authorized to approve which agent's output — does the existing RBAC lattice (staff/manager/admin) map cleanly onto agent-approval authority, or does e.g. approving a real purchase order warrant a stricter gate than the current `require_manager` pattern used elsewhere?

## E. Phase C/D/E/F Scoping — Sequencing Confirmation

20. Given Phase C (RAG/embeddings/content-gen) and Phase D (agents) both being unstarted, and this audit's finding that several Phase D agents don't actually need Phase C's embeddings — does the owner agree with re-sequencing to "Phase D's numeric agents first, Phase C's semantic/RAG work second," or is there a business reason (e.g. wanting the RAG chatbot specifically, for a specific use case) to keep the lettered order?
21. Phase E (MCP server for Manastra) and Phase F (Puranic public storefront) both depend on work not yet started. Is there an external deadline on either (e.g. a domain registration, a business commitment tied to puranic.in) that should reorder priority ahead of Phase D, or are both genuinely "whenever Phase D is done"?
22. For Phase F specifically: is `puranic.in` domain already owned/configured, or is that itself an open task blocking any storefront work regardless of code readiness?

## F. Testing & Quality Bar Before Agentic Code

23. Given `cash_closure` and `entity_resolution` have zero dedicated tests today despite being real, money/data-integrity-affecting tools — does the owner want test coverage added retroactively before any agent reads from or reasons about their output, or is the plan to add tests only alongside the next feature touch to each?
24. Is there a target test-coverage bar (e.g. "every new agent ships with at least N tests matching the B5 test-baseline standard") that should be written down as a project rule before Phase D starts, given how easy it would be for 7 new agents to each arrive with inconsistent test rigor?
