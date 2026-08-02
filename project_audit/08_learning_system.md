# 08 — Learning System (AxonFlux Academy)

## What Axon Academy Is

An internal learning portal built into the same Next.js app (`web/app/(internal)/academy/*`), driven by TypeScript content modules in `web/lib/academy/*.ts`. It exists because the owner is explicitly using AxonFlux as a vehicle to learn systems/ML/AI engineering, not just to ship a product — this mirrors the mentorship-mode instruction in the global CLAUDE.md (progressive understanding over blind implementation) applied at the product level, not just the conversational level.

It absorbed the old `/docs` system-design page as two of its tabs (**Deep Dive** and **Library**), so there is no separate docs site anymore — Academy is the single learning surface.

## Structure

| Page | Purpose |
|---|---|
| `academy` | Landing/hub |
| `academy/topics`, `topics/[id]` | Topic detail pages, split into two content sets: Data/Backend and ML/AI |
| `academy/graph` | **Synapse Map** — interactive knowledge graph, confidence-colored nodes, a `recommendNext()` algorithm suggesting what to study next based on prerequisite edges |
| `academy/path` | Guided linear learning path |
| `academy/features`, `features/[id]` | Feature case studies — real shipped features explained as teaching material |
| `academy/architecture` | Clickable system-architecture explorer (`ArchitectureMap` component) |
| `academy/roadmap` | Frontier/phase roadmap view (same roadmap as CLAUDE.md, presented for learning) |
| `academy/rebuild` | "Rebuild it yourself" challenge exercises |
| `academy/interview` | Interview-prep deck |
| `academy/deep-dive` | Narrative system-design explainer (absorbed old `/docs`), rendered via ~14 section components under `components/docs/explainer/` |
| `academy/library` | Markdown docs library browser, served live from the repo's `docs/` folder via `GET /api/docs` |

## Content Inventory

**Topics — Data/Backend (12):** Three-Layer Immutable Data Architecture, Idempotency & Deterministic Pipelines, Window Functions & Time-Series SQL, PostgreSQL Performance & EXPLAIN, JWT Authentication, Role-Based Access Control, Dependency Injection, Plugin/Registry Architecture, Caching with Redis, Background Workers & Job Queues, Event-Driven Architecture & Outbox, Rate Limiting.

**Topics — ML/AI (17):** Basket Analysis, Entity Resolution, Experiment Tracking (MLflow), Demand Forecasting, LLM Provider Abstraction, LLM Cost Tracking, Tool Calling & Agent Loop, Structured Outputs, Embeddings, Vector Search/pgvector, RAG, Multi-Agent Orchestration, Conversation Memory, LLM Evaluation, AI Observability, Prompt Versioning, MCP.

**Feature case studies (8):** Weekly Data Pipeline, Authentication & Roles, Campaign Studio (AI Design Authoring), Entity Resolution Tool, ML Demand Forecasting, Cash Closure, Storage Abstraction (Local/R2), Customer Analytics & Lapsed Tiers.

**Roadmap phases (6, Academy's own framing — parallel to but distinct from CLAUDE.md's A–F phases):** Phase 1 Production Backbone (✅ A4 RBAC marked done, rest pending), Phase 2 Search & Embedding Infra, Phase 3 Retail Co-pilot (RAG/Agentic), Phase 4 LLMOps (Evals/Tracing/Prompt Registry), Phase 5 Multi-Agent Intelligence, Phase 6 MCP Server. Also explicitly lists **deliberately-rejected technology** as "interview ammunition": Kafka, a dedicated vector DB, a workflow orchestrator, vector-based long-term memory, microservices — i.e. the Academy content itself documents *why not* as much as *what*.

**Rebuild challenges (6):** Implement `require_manager`, Rebuild Login→Guarded Request Flow, Rebuild Pseudo-Stock in SQL, Design the Provider Port, Rebuild the Agent Loop, Design the Analytics Cache (Phase 1 Prep).

**Interview deck:** 6 cross-cutting system questions (90-second overview, why not off-the-shelf BI, worst engineering decision made, where AI was deliberately *not* used, scaling to 50 stores, solo-dev quality bar) plus auto-generated per-topic/per-feature questions.

## How Learning Integrates With Development

The integration is tight and bidirectional, not a bolt-on wiki:
- Every shipped feature becomes a **feature case study** (8 so far) — the Academy is updated as part of shipping, via the `update-progress` skill (per memory: `[[feedback_explainer_updates]]` — "update project explainer" means patch in-place with the current session's work, not regenerate from scratch).
- The **Synapse Map**'s confidence tracking is genuinely used to drive what the owner studies next (`recommendNext()`), not just a decorative graph.
- The roadmap phases in the Academy explicitly encode **rejected alternatives** (Kafka, vector DB, orchestrator, microservices) as teaching content — meaning architectural decisions are captured as learning material at the point they're made, not reconstructed after the fact.
- Progress tracking (`web/lib/academy/progress.ts`) is currently **localStorage-only** — the code itself documents this as a deliberate stop-gap, with an explicit escalation path noted in its own comments ("if progress ever needs to survive browsers/devices, promote to `app.academy_progress`"). This is a known, accepted gap, not an oversight.

## Current Missing Topics

Given the roadmap phases the Academy itself lists, the following ML/AI topics are named in the roadmap but have **no corresponding topic entry yet** in the 17-item ML/AI topic list above — worth adding as Phase C/D actually gets built:
- Decision-engine / briefing-generation patterns (for C5)
- Agent audit-logging / human-approval-loop design patterns (for Phase D, given the hard "read-only + suggest" rule — this is a first-class architectural concept in this project and deserves its own topic, not just "Multi-Agent Orchestration")
- Static-export + build-time data snapshotting for a public site sourced from a private DB (for Phase F storefront) — currently absent from both Data/Backend and ML/AI topic lists despite being a real, non-trivial pattern this project will need
- Vercel Marketplace / OAuth-based external write path (for D7 Publisher Agent's "git push → Vercel auto-deploys" flow) — not currently represented as a topic anywhere
