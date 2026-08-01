# AxonFlux Academy V2 — Redesign Proposal

**Status:** Proposal only — not implemented. No code changes accompany this document.
**Author context:** Academy currently ships as `web/app/(internal)/academy/*`, driven by data modules in `web/lib/academy/*.ts`. This proposal reorganizes that content around capability and civilization, not technology. It does not discard anything currently written.

---

## 0. What already exists that this proposal builds on

Before proposing anything new, it's worth being precise about what's already true in the codebase, because the redesign is a *reorganization* of real infrastructure, not a rebuild from zero:

- **`Topic` already has `prereqs`/`unlocks` + an `(x,y)` position** (`web/lib/academy/types.ts:26-67`). The Synapse Map is already a dependency graph, not a flat list.
- **`topics.ts` already computes a topological DAG** — `topologicalLayers()`, `recommendNext()`, `ancestryOf()` (`web/lib/academy/topics.ts:26-82`). "What should I learn next?" is already a working algorithm, not a wireframe idea.
- **`ArchNode`/`ArchEdge`** (`types.ts:93-117`) already model the Architecture Explorer as a graph with `whyThisDesign`, `alternatives`, `tradeoffs`, `relatedTopics` — i.e., the Architecture Atlas's per-node content shape this proposal asks for is already authored per node.
- **`Confidence`** is already a graded scale (`none`/`partial`/`solid`), not a percentage (`types.ts:7`), and `progress.ts` already documents its own upgrade path in a code comment: *"If progress ever needs to survive browsers/devices, promote this to `app.academy_progress`... That migration is itself a documented exercise in the Academy."* The localStorage-vs-server tension this proposal will revisit was anticipated in the code already.
- **`RoadmapPhase`** (`types.ts:131-147`) already carries `learningValue`/`interviewValue`/`productionValue`/`complexity`/`resume` — a proto "civilization stats" model per phase, just not surfaced as a tech-tree UI yet.
- **Content inventory (unchanged, all preserved):** 29 topics (12 data/backend + 17 ai/ml), 8 feature case studies, 6 roadmap phases, 11 architecture nodes, 6 rebuild challenges, an interview deck. ~3,100 lines of authored content across 9 data files.
- **Decision history already exists too, outside the Academy proper:** `docs/decisions/*.md` holds 6 real ADRs (schema separation, plugin system, entity resolution, raw-triggers-outside-alembic, BOM design, RBAC lattice), each already structured as decision + alternatives rejected + tradeoffs. §19 below treats these as the seed of Decision History rather than something to author from scratch — the writing already exists, it's just filed under `docs/`, not surfaced in the Academy.

**Amendment (2026-08-02):** §19–§24 below fold in a second round of refinements — Decision History, an expanded Engineering Journal, a permanent Project DNA principles page, Knowledge Debt as a distinct axis from Ring progress, a Confidence Heatmap on the Atlas, and an explicit Academy-synchronization data-model note. These change the §7 data model (rings become flag-based, not a single int) and are called out inline wherever they touch an earlier section.

The redesign's job, therefore, is: **rename and re-thread the organizing principle from "domain" (data/backend/ai/ml) to "capability unlocked," and extend the existing graph/DAG engine to a second axis (civilization progression) without breaking the first (concept mastery).** Everything below is written with that constraint in mind — this is additive and re-organizational, not a rewrite of working systems.

---

## 1. New Information Architecture

Three pillars, one shared content spine:

```
                    ┌─────────────────────┐
                    │   CIVILIZATION MAP    │   "Where am I going, and why?"
                    │   (5 independent      │   Motivational / sequencing layer.
                    │    tech trees)        │   New.
                    └──────────┬───────────┘
                               │ each node points at
                               ▼
                    ┌─────────────────────┐
                    │  NEURAL CONSTELLATION │   "Do I understand this concept?"
                    │  (concept graph)       │   Existing Synapse Map, extended
                    │                        │   with Knowledge Rings.
                    └──────────┬───────────┘
                               │ concepts compose into
                               ▼
                    ┌─────────────────────┐
                    │   AXONFLUX ATLAS      │   "How does MY project use this?"
                    │  (features + arch)    │   Existing Feature Explorer +
                    │                        │   Architecture Explorer, merged.
                    └──────────┬───────────┘
                               │ grouped by
                               ▼
                    ┌─────────────────────┐
                    │  CAPABILITY PAGES     │   "What can I now DO?"
                    │  (Information Agent,   │   New — the organizing unit
                    │   Forecast Agent, ...) │   that replaces domain-based nav.
                    └──────────┬───────────┘
                               │ each capability ends in
                               ▼
                    ┌─────────────────────┐
                    │ INTERVIEW + REBUILD   │   Existing Interview Mode +
                    │                        │   Rebuild Mode, now scoped per
                    │                        │   capability instead of per topic.
                    └─────────────────────┘
```

**The key structural change:** today, navigation asks "which domain do you want to browse" (data/backend/ai/ml). The redesign asks "which capability do you want to unlock" — and every capability pulls the concepts, architecture, interview questions, and rebuild challenges it needs from the *same underlying content*, just queried differently. No content is domain-owned anymore; it's tagged and pulled.

## 2. Navigation

Top-level nav collapses from the current 10 flat sections to 4, each a pillar:

| Old nav item | New home |
|---|---|
| Learning paths | Civilization Map (path *is* the tech tree now) |
| Synapse Map | Neural Constellation |
| Architecture Explorer | Atlas → Architecture tab |
| Feature Explorer | Atlas → Features tab |
| Theory | Neural Constellation (theory is Ring 1 of a node) |
| Interview Mode | Surfaced per-capability + a global "Interview Deck" under Constellation |
| Rebuild Mode | Surfaced per-capability + a global "Rebuild Challenges" under Constellation |
| Roadmap | Civilization Map (roadmap phases become tree ages/nodes) |
| Deep Dive | Atlas → "Origin Story" tab (kept, renamed for consistency) |
| Library | Kept as-is under a persistent "Reference" utility nav — it's raw markdown browsing, not a pillar |

Global persistent elements: a home/dashboard (§15 below), a `Ctrl+K` command palette (§ "Search"), and a slide-out "current mission" tracker showing the active capability + next unlock, visible from every page so the user is never more than one click from "what am I doing right now."

```
┌──────────────────────────────────────────────────────────┐
│ ⌘K search        AxonFlux Academy         🔥 Mission: ... │
├───────────┬────────────────────────────────────────────────┤
│ Home       │                                                │
│ Civilization│                                               │
│ Constellation│              (page content)                 │
│ Atlas       │                                                │
│ Interview   │                                                │
│ Rebuild     │                                                │
│ Library     │                                                │
└───────────┴────────────────────────────────────────────────┘
```

## 3. Complete Civilization Trees

Five independent trees, each a linear-with-branches DAG (same graph engine as the Neural Constellation, filtered to tree-defining nodes). Each tree node **references** Neural Constellation topic ids rather than duplicating content — a tree node is a *milestone made of concepts*, not new writing.

### A. Engineering Civilization
```
Programming → Backend → Database → API Design → Distributed Systems → Cloud → Production Engineering
```
Maps almost entirely onto existing `data`+`backend` topics (12 topics: JWT, RBAC, Dependency Injection, Plugin/Registry Architecture, Window Functions, Postgres Performance, Caching/Redis, Background Workers, Event-Driven/Outbox, Rate Limiting, Idempotency, Three-Layer Architecture). **Gap:** "Distributed Systems" and "Cloud" nodes have no authored topic yet — flag as new content to write, not to invent placeholder pages for.

### B. AI Civilization
```
Prompting → Embeddings → Vector Search → Hybrid Retrieval → Tool Calling → Structured Outputs
   → Conversation Memory → Planning → Multi-Agent → Evaluation → Observability → MCP → Autonomous Systems
```
Maps onto the existing 17 `ai`/`ml` topics almost node-for-node (LLM Provider Abstraction, Tool Calling & Agent Loop, Structured Outputs, Embeddings, Vector Search/pgvector, RAG, Multi-Agent Orchestration, Conversation Memory, LLM Evaluation, AI Observability, Prompt Versioning, MCP already exist). **Gaps:** "Hybrid Retrieval" and "Planning" and "Autonomous Systems" have no topic yet — genuinely frontier content, matching Phase C/D of the engineering roadmap being unbuilt.

### C. Computer Science Civilization
```
Arrays → Hash Tables → Trees → Graphs → Dynamic Programming → Greedy → Concurrency → Operating Systems → Networking → Compilers
```
**This tree has almost zero authored content today.** No CS-fundamentals topics exist in `topics-data-backend.ts` or `topics-ml-ai.ts` — the Academy today is entirely project-grounded (every topic ties to "how AxonFlux uses it"). This is the one tree that's a genuinely new content commitment, not a reorganization. Recommend scoping it deliberately small at first (interview-prep depth, not CLRS depth) and tying each node back to a real AxonFlux moment wherever one exists (e.g. Graphs → the topological-sort code already running in `topics.ts` itself; Concurrency → the pipeline's subprocess model) so it doesn't become disconnected theory homework.

### D. System Design Civilization
```
Caching → Queues → Database Scaling → Load Balancing → Consistency → CAP → Event Driven → Microservices → Observability → Distributed Architecture
```
Partial overlap with Engineering Civilization (Caching, Event-Driven already exist as topics) — recommend **not** duplicating nodes across trees; instead let a node appear once in whichever tree is its primary home and have the other tree link to it. Academy's own roadmap content (`roadmap.ts`) already explicitly documents *rejected* system-design tech (Kafka, dedicated vector DB, orchestrator, microservices) as "interview ammunition" — this is valuable content that slots directly into this tree's nodes as a "why we didn't take this path" annotation, matching the Discovery Journal concept in §Neural Constellation.

### E. Retail Intelligence Civilization
```
Product Knowledge → Customer Understanding → Analytics → Forecasting → Recommendations → Planning
   → Decision Intelligence → Retail Copilot → Retail Operating System
```
This is the tree with the *most* real, shipped, production content behind it already — it maps directly onto the 8 existing feature case studies (Data Pipeline, Customer Analytics, Demand Forecasting, Entity Resolution, Campaign Studio, Cash Closure, Storage Abstraction, Auth/RBAC) plus everything documented in the repo audit's `06_ai_readiness.md` (Information/Analytics/Inventory/Forecast/Purchase Planner/Marketing agents). Recommend building this tree first — it requires the least new writing and has the highest "I already did this" payoff, which matters for a system explicitly designed to feel like progress, not homework.

## 4. Complete Capability Graph

Capabilities are the redesign's actual organizing unit — each is a mission that consumes concepts (Constellation) and project reality (Atlas) and produces an interview-ready, rebuildable skill.

| Capability | Primary tree(s) | Readiness today (reusing repo-audit findings) | Status |
|---|---|---|---|
| Information Agent | Retail Intel + AI (Tool Calling) | High — reuses 100% of shipped read endpoints | Next candidate |
| Analytics Agent | Retail Intel + AI (Planning) | Medium — data ready, orchestration not | Planned |
| Inventory Agent | Retail Intel | High — BOM Manager already solves the hard part | Planned |
| Forecast Agent | Retail Intel + AI (Evaluation) | Medium-low — blocked on B1 model validation | In progress (B1) |
| Purchase Planner | Retail Intel + AI (Multi-Agent) | Medium — analytics ready, no approval-queue pattern yet | Planned |
| Marketing Agent | Retail Intel + AI (Tool Calling) | Medium — Campaign Studio's `apply_dsl_patch` is direct precedent | Planned |
| Memory Agent | AI (Conversation Memory) | Low — open design question (AxonFlux vs. Manastra) | Blocked on decision |
| Vision Agent | AI | Low-medium — pamphlet image-scan agent is a working precedent to generalize | Partial (narrow) |
| Voice Agent | — | Not scoped anywhere in the actual roadmap | **Flag, don't build a page yet** |
| Multi-Agent Coordinator | AI (Multi-Agent, MCP) | Low — architectural linchpin, no shared scaffold exists | Foundational blocker |
| Campaign Intelligence | Retail Intel + AI | Medium — Campaign Studio ships; "Suggest Products" not yet | Planned |
| Retail Copilot | Retail Intel + AI (RAG) | Low — blocked on embeddings/pgvector (Phase C3) | Blocked |
| Storefront Agent (D7) | Retail Intel + Engineering (Cloud) | Low — 4-subagent design on paper only | Planned |

**Design note on Voice Agent:** it's listed in this proposal's brief but appears nowhere in the actual AxonFlux CLAUDE.md roadmap, ADRs, or Academy content surveyed. Recommend *not* building it a Capability page yet — an empty "locked, no ETA" node undermines the tech-tree's promise that locked nodes are real, sequenced future work. Add it only once it's an actual roadmap item.

Each Capability page's structure (Mission / Prerequisites / Required Knowledge / Architecture / Implementation / Interview / Rebuild / Unlocks) is *exactly* the existing `Feature` type (`types.ts:75-91`) plus a `prereqCapabilities: string[]` and `unlocksCapabilities: string[]` field layered on top — see §7.

## 5. Relationship Between Civilization, Atlas, and Neural Constellation

The three pillars are not separate content — they are three different **queries over the same tagged content graph**, plus one new layer (Civilization) that didn't exist before:

```
Civilization Map node ──references──▶ N Neural Constellation topics (existing Topic[])
        │                                        │
        │ "unlocks"                              │ "prereqs / unlocks"
        ▼                                        ▼
Capability page ◀──"required knowledge"── Neural Constellation topic
        │                                        │
        │ "implemented by"                       │ "used by" (relatedTopics)
        ▼                                        ▼
Atlas Feature/ArchNode ◀──────cross-linked───────┘
```

Concretely: a Civilization node like "Tool Calling" in the AI tree is a thin wrapper that says "this milestone = Constellation topic `tool-calling-agent-loop` at Ring 3 (Implementation) or higher." A Capability page like "Information Agent" says "prerequisite knowledge = these 4 Constellation topics; implemented in Atlas at these 3 files/features." The Atlas itself stays exactly what it is today (Feature + ArchNode graphs) — it's the leaf layer everything else points into, because it's the only pillar that's *specifically about this one project* rather than general knowledge.

This means: **adding a new Capability never requires writing new theory from scratch** if the Constellation topic already exists — it only requires tagging existing topics as prerequisites and pointing at the Atlas files that implement it. New theory is only needed when a genuinely new concept enters the codebase (e.g., when pgvector actually ships, the "Vector Search" topic goes from `status: "planned"` to `status: "ready"` and gets its full 3-level content — this `status` field already exists in `Topic` today).

## 6. Wireframes

### 6.1 Home ("Command Center")
```
┌────────────────────────────────────────────────────────────────┐
│  AxonFlux Academy                                    ⌘K search  │
├────────────────────────────────────────────────────────────────┤
│  Current Age: Age II — Retail Intelligence               │
│  Current Mission: Information Agent  (3 of 5 unlocks done)│
│                                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │
│  │ Engineering  │ │     AI      │ │Retail Intel │  ← 5    │
│  │ ████████░░  │ │ ████░░░░░░  │ │ ██████████  │    tree  │
│  │  Age III     │ │  Age I      │ │  Age III    │    dials │
│  └─────────────┘ └─────────────┘ └─────────────┘         │
│                                                            │
│  Next Unlock: Tool Calling & Agent Loop                   │
│    → unlocks: Information Agent, Marketing Agent           │
│    → knowledge required: REST APIs ✅  DI ✅  Tool Calling ⏳│
│    → expected outcome: "ask a plain question, get a real   │
│       number back from store data"                         │
│                                                            │
│  Weakest concepts (Ring ≤2):  Embeddings · MCP · Planning  │
│  Knowledge debt flagged: 2  (see §21)                      │
│  Today's suggested learning:  [Tool Calling] [Embeddings]  │
│  Recent discoveries:  "Why raw is never a VIEW" (2026-07)  │
│                                                            │
│  ── Civilization Index (§22) ──────────────────────────    │
│  Ages progressed: 7 across 5 trees · Capabilities built: 8 │
│  Architecture confidence: mostly high, 3 amber components  │
│  Interview readiness: strong · Rebuild readiness: partial  │
└────────────────────────────────────────────────────────────┘
```
No percentages anywhere — ages, unlock counts, named weakest concepts, named debt items.

### 6.2 Civilization Map (one tree, e.g. AI)
```
Prompting ──▶ Embeddings ──▶ Vector Search ──▶ Hybrid Retrieval
                  │                                  │
                  ▼                                  ▼
           Tool Calling ──▶ Structured Outputs   Conversation Memory
                  │                                  │
                  └──────────────┬───────────────────┘
                                 ▼
                            Multi-Agent ──▶ Evaluation ──▶ MCP ──▶ Autonomous
     ● = mastered (gold)   ◐ = partial   ○ = locked (grey, faded)   ◉ = current mission (pulses)
```
Clicking any node opens a side panel: Knowledge / Architecture / Interview / Implementation / Rebuild tabs (not a full page nav — keeps you inside the tree).

### 6.3 Neural Constellation (extended)
Same force-directed / positioned graph as today, unchanged visually, plus:
```
        ○ Embeddings                    Node ring (concentric, not a badge):
       ╱│╲                                Ring1 Theory       ●●●●●  (5 filled = mastered)
      ╱ │ ╲                               Ring2 Explain      ●●●○○
     ○  ○  ○  ← prereq fan-in            Ring3 Implement    ●●○○○
                                          Ring4 Production   ●○○○○
  Hover → highlights full prereq chain    Ring5 Mastery      ○○○○○
  (ancestryOf() already computes this)
```

### 6.4 Capability Page (e.g. Information Agent)
```
┌────────────────────────────────────────────────────┐
│ MISSION: Information Agent                          │
│ "Answer 'what's selling well' from real store data"│
│ Readiness ████████░░  (reused from repo audit)      │
├────────────────────────────────────────────────────┤
│ Required Knowledge (Constellation)                   │
│  ✅ REST APIs   ✅ Dependency Injection   ⏳ Tool Calling│
├────────────────────────────────────────────────────┤
│ Architecture           [flow diagram, Atlas-sourced] │
│ Implementation         api/analytics/*, api/agents/*│
├────────────────────────────────────────────────────┤
│ Interview (4Q)   ·   Rebuild Challenge   ·   Journal │
├────────────────────────────────────────────────────┤
│ Unlocks → Analytics Agent, Marketing Agent           │
└────────────────────────────────────────────────────┘
```

### 6.5 Rebuild Mode (puzzle framing)
```
┌───────────────────────────────────────────┐
│ Rebuild: Pseudo-Stock in SQL                │
│ Hint 1 (free): "cumulative window function" │
│ Hint 2 (–confidence): shows table shape      │
│ Hint 3 (–confidence): shows the JOIN         │
│ [ I've got it — check my approach ]          │
│ Rebuild confidence: ●●●○○                   │
└───────────────────────────────────────────┘
```

## 7. Data Model Changes

All additive to `web/lib/academy/types.ts` — **nothing existing is removed or renamed**, because `Topic`, `Feature`, `ArchNode`, `Challenge`, `RoadmapPhase` all stay exactly as-is and continue to be the leaf content.

```ts
// New: replaces the flat Domain-based color/label lookup as the primary
// grouping — Domain stays on Topic for backward compat / filtering, but
// navigation no longer keys off it.
export type CivilizationId = "engineering" | "ai" | "cs" | "system-design" | "retail-intel";

export interface CivilizationNode {
  id: string;
  civilization: CivilizationId;
  title: string;
  /** Constellation topics this milestone represents. Node is "reached" when
   *  all referenced topics are at minRing or above. */
  topicIds: string[];
  minRing: KnowledgeRing;
  prereqNodes: string[]; // other CivilizationNode ids
  age: number; // 1-indexed, purely presentational grouping within a tree
}

// REVISED (was a single 0-5 int in the first draft). Knowledge Debt (§21)
// needs to detect states where the ladder is broken — e.g. "implemented but
// never understood" — which a single collapsed int cannot represent (you
// can't tell degree-5-via-shortcut from degree-5-honestly-earned). So each
// rung is its own flag, with a timestamp for staleness detection ("known but
// forgotten"). `ring` (the old int, = count of true flags in order) is kept
// as a derived getter for anything that only wants the old display value —
// nothing that consumed the old shape breaks.
export interface RingProgress {
  topicId: string;
  theory: boolean;      // Ring 1 — do I understand it
  explain: boolean;      // Ring 2 — can I teach it
  implement: boolean;    // Ring 3 — have I built it
  production: boolean;   // Ring 4 — is it live in AxonFlux
  mastery: boolean;      // Ring 5 — interview-confident
  lastTouchedAt: string; // ISO date, updated on any flag flip — staleness input
}

// Derived, not stored: the four Knowledge Debt states from the refinement
// brief. Computed per topic from RingProgress, never authored by hand.
export type KnowledgeDebt =
  | "unknown"                        // no flags set
  | "known-but-forgotten"            // theory/explain true, lastTouchedAt stale (see §21 threshold)
  | "understood-but-not-implemented" // theory+explain true, implement false
  | "implemented-but-not-understood";// implement true, theory or explain false — the anomaly a single int hid

// New: a Decision Record — the shared shape behind Decision History (§19).
// ArchNode.whyThisDesign/alternatives/tradeoffs already IS this shape today,
// just inline on ArchNode instead of reusable; this type lets Capabilities,
// Civilization nodes, and standalone decisions (things with no single owning
// ArchNode) carry the same structure without duplicating fields.
export interface DecisionRecord {
  id: string;
  title: string;
  date: string;
  originalApproach: string;
  alternativesConsidered: string[];
  finalDecision: string;
  tradeoffs: string;
  lessonsLearned: string;
  /** Links to docs/decisions/*.md when this decision already has a real ADR — see §19. */
  adrFile?: string;
  principleRefs: string[]; // DNAPrinciple ids this decision either follows or deliberately bends
}

// New: Engineering Journal entry (§20) — the expanded Discovery Journal.
// Replaces the plain `ContentSection[]` sketched for Capability.discoveryJournal
// in the first draft with a structured shape matching the refinement brief
// exactly, so "what did I try and reject" survives as data, not prose alone.
export interface JournalEntry {
  id: string;
  capabilityId: string;
  date: string;
  problem: string;
  assumptions: string[];
  experiments: string[];
  rejectedIdeas: string[];
  mistakes: string[];
  finalSolution: string;
  futureImprovements: string[];
}

// New: Project DNA (§19) — a small, deliberately-hard-to-grow list of
// timeless principles. Every DecisionRecord/ArchNode/Capability can cite
// these by id; the list itself should rarely change.
export interface DNAPrinciple {
  id: string;
  statement: string; // e.g. "Raw data is immutable."
  rationale: string;
  /** ArchNode/Capability/DecisionRecord ids that exemplify this principle in real code. */
  examples: string[];
}

// New: the Capability type. Deliberately a superset of Feature, not a
// replacement — a Capability can wrap zero or one existing Feature (for
// shipped work) plus forward-looking fields Feature doesn't need.
export interface Capability {
  id: string;
  title: string;
  mission: string;
  businessValue: string;
  prereqCapabilities: string[];
  requiredTopicIds: string[]; // Constellation topics needed
  featureId?: string; // links to existing Feature, if shipped
  archNodeIds: string[]; // links to existing ArchNode[]
  interview: QA[]; // can reuse Feature.interview if featureId set
  rebuildChallengeId?: string; // links to existing Challenge, if one exists
  unlocksCapabilities: string[];
  readinessPct: number; // seeded from repo-audit-style scoring, editable
  /** What becomes newly possible once this ships — surfaced on the "Today's Mission" panel (§7 amendment / §6.1). */
  expectedOutcome: string;
  decisionRecordIds: string[]; // §19
  journalEntryIds: string[]; // §20
  principleRefs: string[]; // §19 — which DNA principles this capability embodies
}
```

**Amendment to `ContentSection`** (§Explanation Style, §23): add an optional `mode?: "intuition" | "visual" | "analogy" | "formal"` tag so a single Level 2/3 can hold multiple parallel explanations of the same mechanism instead of forcing one linear narrative — a topic can have three Level-2 `ContentSection`s tagged `intuition`, `analogy`, `formal` and the renderer lets the reader pick, rather than the author picking for them. `Topic.analogy` (already existing) stays as the always-shown first-contact analogy; `mode`-tagged sections are the deeper, optional-depth versions of the same idea.

**Amendment to `ArchNode`** (§Confidence Heatmap, §21): add `myConfidence?: Confidence` — reuses the existing 3-level `Confidence` type verbatim (no new enum). Explicitly named `myConfidence` and documented as "how well I personally understand this component," not a code-quality or test-coverage signal, so it's never confused with something like a linter score.

**Deliberate non-change:** `Domain` stays exactly as-is (`data`/`backend`/`ai`/`ml`) — it's still useful for filtering/coloring inside the Constellation view. The redesign doesn't touch it because nothing about "organize navigation by capability" requires deleting a working, small enum. Resist the urge to rename it to match `CivilizationId` — they're different axes (one is "what kind of concept," the other is "what mission does this serve"), and collapsing them would lose information.

## 8. Migration Plan

Non-destructive, incremental, each step independently shippable:

1. **Add types only** — `CivilizationNode`, `RingProgress`, `Capability`, `DecisionRecord`, `JournalEntry`, `DNAPrinciple` land in `types.ts` with zero consumers. Nothing renders differently yet. (Matches this codebase's existing convention of content-type-first, component-second — see `types.ts:1-4`'s own stated philosophy.)
2. **Seed one Civilization tree** — Retail Intelligence, since it has the most existing content to reference (§3E). Author `civilization-retail-intel.ts` as pure references to existing topic ids; no new topic content required for the first pass.
3. **Seed Project DNA first, before anything else that cites it** (§19) — a short, deliberately small `dna.ts` (5-10 principles, e.g. "raw is immutable," "agents suggest, humans approve," pulled straight from CLAUDE.md's own stated rules and the 6 existing ADRs, not invented). Small and early because later steps (`DecisionRecord.principleRefs`, `Capability.principleRefs`) reference it by id.
4. **Seed the Capability graph in read-only form** — author `capabilities.ts` for the 13 capabilities in §4, each referencing existing `Feature`/`ArchNode`/`Challenge` ids where they exist, marked `featureId: undefined` where they're future work, and citing the DNA principles from step 3. This can ship as a new page (`/academy/capabilities`) without touching any existing route.
5. **Seed Decision History from what already exists** (§19) — author `decisions.ts` wrapping the 6 real ADRs in `docs/decisions/*.md` as `DecisionRecord`s with `adrFile` set; this is transcription of already-written material into structured fields, not new authoring. New decisions (things with no ADR yet) get a `DecisionRecord` with `adrFile: undefined`.
6. **Extend `progress.ts` to dual-write** — add `rings: Record<string, RingProgress>` (flag-based, §7 amendment) alongside the existing `confidence` map. On read, derive the flags from `confidence` for any topic not yet explicitly ring-rated (`none`→ all false, `partial`→ theory+explain true, `solid`→ all but mastery true, as a sane one-time default), so existing users' progress isn't reset to zero. `lastTouchedAt` for migrated rows can default to the migration date itself (can't recover true history, but doesn't falsely claim staleness either). New interactions write flags directly; the old `confidence` field becomes a derived read (`solid` if `mastery||production`, `partial` if any flag true, else `none`) so nothing reading the old field breaks mid-migration.
7. **Add the Civilization Map page**, reading the new tree + ring data, fully additive — old Roadmap page stays live and unlinked-but-not-deleted during this step.
8. **Merge Architecture Explorer + Feature Explorer into Atlas** (`/academy/atlas`), adding the `myConfidence` heatmap overlay (§21) on `ArchNode` at the same time since it's a rendering change to the exact page being touched anyway — this is a page merge (§10) plus one new optional field, not a data model overhaul; both existing data sources (`ArchNode[]`, `Feature[]`) get rendered in one shell with tabs.
9. **Retire old nav entries** per §9/§10 table, replacing with redirects (same pattern already used for `/docs` → `/academy/deep-dive`).
10. **Only then**, backfill the remaining 4 Civilization trees, any missing topic content (CS Civilization nodes, Distributed Systems, Cloud, Hybrid Retrieval, Planning), and the first real `JournalEntry` records for already-shipped capabilities (§20) — all net-new writing, paced deliberately rather than rushed to "complete the redesign," since forced/shallow content is worse than an honestly-empty locked node.

At every step, the existing 3,132 lines of authored content in `topics-*.ts`, `features.ts`, `architecture.ts`, `challenges.ts`, `interview.ts`, `roadmap.ts` are **read, never rewritten** — the redesign is a new layer of references on top.

## 9. Pages to Remove

None outright — but two become pure redirects (matching the existing `/docs` → `/academy/deep-dive` precedent, so this is a repeated pattern, not a new one):
- `/academy/roadmap` → redirects to `/academy/civilization` (content lives on inside tree nodes' "age" grouping, not lost)
- `/academy/topics` (flat list view) → redirects to `/academy/constellation` (the graph view already subsumes the flat list; keep flat list as a `?view=list` toggle inside Constellation for accessibility/search, not a separate route)

## 10. Pages to Merge

- `/academy/architecture` + `/academy/features` → `/academy/atlas` (two tabs: Architecture, Features). They already cross-reference each other via `relatedTopics`/`theory` fields — merging removes a click, not content.
- `/academy/interview` + per-topic/per-feature interview questions → stay queryable both ways: a global Interview Deck (existing page, kept) *and* surfaced inline on Capability/Constellation-node panels (new, additive).
- `/academy/rebuild` + per-topic rebuild challenges → same pattern as interview: global list kept, inline surfacing added.

## 11. Pages to Split

- `/academy/deep-dive` (currently one long narrative, ~14 sections in `components/docs/explainer/`) → recommend splitting into **one Origin-Story tab per Civilization tree** inside the Atlas, so "why does the raw/derived/app split exist" lives specifically under Engineering Civilization's context, "why RapidFuzz for entity resolution" lives under Retail Intelligence, etc. This makes the existing narrative content discoverable *from* the tree that motivated it, instead of one monolithic scroll. No content is cut — it's re-chunked and cross-linked.

## 12. UX Improvements

- Persistent "current mission" strip (§2) so the user is never lost between pillars.
- `recommendNext()` (already implemented) surfaces on the Home command center, not just buried in the graph page.
- Every Capability/Constellation node's side panel opens **in place** (drawer/panel), not a full navigation — matches the "never lose your position in the tree" principle from Civilization VI's tech-tree UX, which the user explicitly cited.
- Command palette (`Ctrl+K`) indexes across all five content types (Topics, Features, ArchNodes, Challenges, Capabilities) using a single search index built once at build time (static content, no need for a live search backend).

## 13. Visual Style Suggestions

- Base aesthetic: Notion/Linear information density, not a marketing site — large monitor first (matches existing `05_frontend_status.md` finding that this app has no responsive-mobile ambition for internal tools).
- Color system exactly as specified in the brief, applied consistently: Blue=Engineering, Purple=AI, Green=Retail, Orange=current mission, Gold=mastered, Gray=locked, Red=needs attention. Recommend defining these as a new `CIVILIZATION_META` const parallel to the existing `DOMAIN_META`/`CONFIDENCE_META` pattern in `types.ts:149-190` — same shape, new table, zero risk to existing consumers.
- Locked nodes: reduced opacity + grayscale filter, not hidden — visible-but-inaccessible is core to the tech-tree feeling of "I know what's coming."

## 14. Animations

Every animation should be a **state signal**, not decoration (per the brief's own instruction) — concretely:
- Node ring fill: animated arc fill on ring-level change, 400-600ms ease-out, once per event (not looping).
- Dependency line "unlock pulse": when a prerequisite's ring crosses the threshold that unlocks a dependent node, animate a light pulse traveling along the edge from prerequisite → dependent — this is the single most important animation because it's the only one that visually teaches the DAG's causality.
- Civilization age transition: a brief full-tree glow when an "age" (a grouped tier of nodes) completes — reserved for genuinely multi-node milestones, not every single topic, so it stays meaningful rather than constant.
- Architecture flow trace (Billing CSV → Ingestion → Raw → Derived → Analytics → Agent → Dashboard): an animated dot traveling the path on demand (button-triggered, not autoplay) — this doubles as a genuinely useful debugging-mental-model tool, not just a flourish.

## 15. Progression System

Two independent progress axes, deliberately not collapsed into one number:
1. **Ring progress per Constellation topic** (0-5, per §7) — "do I understand this specific thing."
2. **Age progress per Civilization tree** (derived: an age is "complete" when all its nodes' referenced topics are at the node's `minRing`) — "how far into this tree am I."

Home page surfaces both as named milestones (§6.1), never raw percentages, per the brief's explicit instruction. `recommendNext()`'s existing ranking logic (ready-status first, in-progress before untouched, easier-difficulty tiebreak) extends unchanged to also consider "what does this topic unlock in the Civilization tree," giving suggestions that are aware of both axes.

## 16. Gamification Ideas

Kept deliberately restrained — the brief explicitly says "optimize for understanding," not points-and-badges:
- **Discovery streaks**: track consecutive days with at least one ring-level-up or one Discovery Journal entry written — visible on Home, not pushed as a notification (no engagement-loop pressure, this is a personal tool, not a product with retention metrics).
- **"Unlock celebration"** on Capability completion (all required topics reach the capability's floor ring) — a one-time animation + the capability's entry moving from "locked" to "built" in the Atlas, functioning as a real milestone marker (this capability is genuinely usable in AxonFlux now) not just a UI toy.
- Explicitly **avoid**: leaderboards, streak-loss anxiety mechanics, arbitrary point totals — none of these serve a single-user learning tool and would fight the "calm, information-dense" visual philosophy in §UX.

## 17. How to Preserve All Existing Content

Concrete mapping table — every current file/page has an explicit destination, nothing orphaned:

| Existing file/page | New home | Change required |
|---|---|---|
| `topics-data-backend.ts`, `topics-ml-ai.ts`, `topics.ts` | Neural Constellation (unchanged) | None — referenced by Civilization nodes, not duplicated |
| `features.ts` | Atlas → Features tab | None — merged view only |
| `architecture.ts` | Atlas → Architecture tab | None — merged view only |
| `challenges.ts` | Rebuild Mode (global) + inline on Capability/Constellation panels | None — surfaced twice, stored once |
| `interview.ts` | Interview Deck (global) + inline on Capability/Constellation panels | None — surfaced twice, stored once |
| `roadmap.ts` | Civilization Map's "age" groupings + per-node stats | Wrapped by new `CivilizationNode` references, source data untouched |
| `progress.ts` | Extended, not replaced (§8 step 4) | Additive `rings` field, `confidence` derivable both ways during transition |
| `types.ts` | Extended, not replaced (§7) | Additive types only |
| `components/docs/explainer/*` (Deep Dive sections) | Atlas → per-tree Origin Story tabs (§11) | Re-chunked, re-linked; text content itself unchanged |
| `academy/library` (docs/ markdown browser) | Kept as-is, persistent utility nav | None |

No file is deleted in this proposal. No authored paragraph is discarded. The only actual content debt this creates is the net-new writing flagged in §3 (CS Civilization tree, a few AI-tree nodes) and §4 (Capability page copy for the ~9 not-yet-built capabilities) — which is genuinely new work, not migration work, and should be scheduled deliberately rather than rushed to make the redesign feel "done."

## 18. How Future AI Capabilities Naturally Plug In

Because Capabilities reference Constellation topics and Atlas features **by id, not by embedding content**, the plug-in path for anything from the actual AxonFlux roadmap (see the separate repo audit, `project_audit/06_ai_readiness.md`) is mechanical:

1. When a real capability ships in AxonFlux itself (e.g. the Weekly Intelligence Agent, per the repo audit's recommended next milestone), its `Feature` entry gets authored in `features.ts` exactly as the 8 existing ones were.
2. Its `Capability` entry in `capabilities.ts` flips `featureId` from `undefined` to the real feature id — the page's "Implementation" section now has real files to point at instead of "planned."
3. Any Constellation topic it required that was `status: "planned"` (theory-only) gets its Level 2/3 content filled in and flips to `status: "ready"` — this is the *exact* mechanism `Topic.status` already documents in its own comment (`types.ts:31`): *"planned = frontier topic: intuition only, deep content lands when the feature is built."*
4. The Civilization tree node(s) referencing that topic automatically become reachable once ring-progress crosses the threshold — no manual tree-editing needed, because nodes reference topics by id and rings are computed, not hardcoded.
5. `unlocksCapabilities` on the newly-shipped capability makes its dependents (e.g. Information Agent unlocking Analytics Agent) visible as "next" automatically via the same `recommendNext()`-style algorithm, extended to the Capability graph.

In short: **shipping a real feature in AxonFlux is the same action as advancing the Academy** — there is no separate "now go update the Academy" step beyond authoring the one `Feature` entry and flipping id references, because everything above it in the pillar stack is computed from those references, not hand-maintained per page. This is the direct realization of the brief's closing line: the project should teach the owner by the mere act of being built.

---

## 19. Decision History & Project DNA

**These are two different things and should not be collapsed into one page**, even though they're related: Decision History is *specific* (this decision, this date, these alternatives); Project DNA is *timeless* (a handful of principles that outlive any single decision).

**Decision History.** The raw material for this already exists and is *better* than anything the Academy would author fresh: `docs/decisions/*.md` holds 6 real ADRs, and `ArchNode.whyThisDesign`/`alternatives`/`tradeoffs` (`types.ts:105-107`) already carries the same shape inline on 11 architecture nodes. The `DecisionRecord` type (§7) is a thin common shape over both — for ArchNode-backed decisions, `DecisionRecord` can be *derived* from the existing `whyThisDesign`/`alternatives`/`tradeoffs` fields rather than re-authored (a mapping function, not new content); for the 6 real ADRs, it's a transcription pass (§8 step 5). Only genuinely new decisions (made after this redesign ships) need a `DecisionRecord` authored from scratch, and at that point it's a 10-minute write, not a research project, because the fields mirror how this project's owner already documents decisions in `docs/decisions/`.

**Project DNA.** A deliberately short, deliberately hard-to-add-to list — 5 to 10 `DNAPrinciple` entries, not 50. Seed candidates, pulled directly from language already in CLAUDE.md and the ADRs rather than invented:
- *Raw data is immutable* (CLAUDE.md's own repeated framing; exemplified by `docs/decisions/001`)
- *Derived data is disposable* (same source; exemplified by the truncate-rebuild pipeline)
- *Agents suggest, humans approve* (Phase D's stated hard rule)
- *Knowledge before automation* (this redesign's own stated purpose — the Academy exists so understanding precedes delegating to an agent)
- *Build capabilities, not features* (this redesign's core reframe, §1)
- *No customer PII crosses a public boundary* (Phase E/F's stated hard rule)

Every `DecisionRecord`, `Capability`, and `ArchNode` can carry `principleRefs` pointing here. The test for whether something belongs on this list: **would I still endorse this in five years regardless of what technology changes underneath it?** If a principle needs an exception clause or a "except when," it's a decision, not DNA — file it under Decision History instead.

## 20. Engineering Journal

The `JournalEntry` type (§7) replaces the plain-prose `discoveryJournal: ContentSection[]` sketched in the first draft with the exact structure from the refinement brief: Problem / Assumptions / Experiments / Rejected Ideas / Mistakes / Final Solution / Future Improvements, one entry per capability per significant milestone (not one entry per capability total — a capability that goes through two real revisions gets two entries, preserving the history rather than overwriting it).

This is explicitly the layer that captures what a "Decision Record" and a "Feature" both leave out: a `DecisionRecord` says *what was decided and why*; a `Feature` says *what shipped*; a `JournalEntry` says *what it actually felt like to build this, including the wrong turns* — mistakes and rejected ideas are first-class fields, not an afterthought, because per the brief's own framing this is "historical memory," and sanitized-success-only history isn't memory, it's marketing copy.

Practically: the best source material for the first batch of these already exists in `.remember/` session history and `docs/session_*.md` notes (per the repo audit's `07_current_roadmap.md`) — e.g. the `set_theme` model-slug saga (three sequential fixes in one day) is a ready-made `JournalEntry` (problem: sub-agent tool calls silently used the wrong provider; rejected ideas: hardcoded haiku, then fable-5; mistakes: didn't validate the model slug against the live OpenRouter catalog before shipping; final solution: thread provider/model through call sites explicitly). Backfilling a handful of these from real session history (§8 step 10) is higher-value than writing hypothetical journal entries for unshipped work.

## 21. Knowledge Debt & Confidence Heatmap

**Knowledge Debt** is a derived read over `RingProgress` (§7), not a separately-authored field — this matters because debt should reflect *actual* flag patterns, never something the owner has to remember to mark:

```
function knowledgeDebt(p: RingProgress): KnowledgeDebt {
  if (!p.theory && !p.explain && !p.implement) return "unknown";
  if (p.implement && !(p.theory && p.explain)) return "implemented-but-not-understood";
  if (p.theory && p.explain && !p.implement) return "understood-but-not-implemented";
  if (isStale(p.lastTouchedAt) && !p.implement) return "known-but-forgotten"; // staleness threshold TBD by the owner, not hardcoded — e.g. 6 months untouched
  return "unknown"; // healthy/current — no debt to flag
}
```

This is precisely why §7 revised `KnowledgeRing` from a single int to independent flags: `implemented-but-not-understood` is a real and important state in this specific project's own history (per the repo audit, several Campaign Studio/pamphlet features shipped under time pressure with provider-wiring bugs that suggest exactly this pattern — implementation outpacing understanding) and a single collapsed "ring 3" would have hidden it rather than surfaced it.

**Confidence Heatmap.** `ArchNode.myConfidence` (§7 amendment) is rendered as a color overlay on the existing Atlas architecture diagram — reusing `CONFIDENCE_META`'s existing color mapping (`types.ts:183-190`: none=slate, partial=amber, solid=emerald) so no new color language is introduced. Explicitly a self-assessment of understanding, never a code-quality or test-coverage metric — the doc string on the field should say this plainly, because "confidence" is an easy word to accidentally conflate with "this code is good," and the whole point here is the opposite question: *do I understand this code*, independent of whether it's good.

## 22. Civilization Index

A single computed rollup, not a new persisted table — every figure on it derives from data that already exists elsewhere in this proposal (`RingProgress`, `CivilizationNode` reachability, `ArchNode.myConfidence`, `Capability` status):

| Metric | Computed from |
|---|---|
| Current Age (per tree) | Highest `CivilizationNode.age` where all referenced topics meet `minRing` |
| Civilizations progressed | Count of trees with ≥1 completed age |
| Current capability | The in-progress `Capability` with the most `requiredTopicIds` already satisfied but not all |
| Architecture confidence | Distribution of `ArchNode.myConfidence` across all 11 nodes (§21) |
| Theory confidence | Distribution of `RingProgress.theory` flags across all 29 topics |
| Interview readiness | Proportion of topics/capabilities with `mastery: true` or a non-empty `interview` array marked reviewed |
| Rebuild readiness | Proportion of `Challenge`/`rebuildChallengeId` entries marked complete in `progress.ts`'s existing `challengesDone` |

Surfaced as one compact panel on Home (§6.1, revised) — named milestones per the brief's explicit "no percentages" instruction (e.g. "7 ages across 5 trees," "3 amber components," not "62%").

## 23. Explanation Style

`Topic.analogy`, `level1`, `level2: ContentSection[]`, `level3: ContentSection[]` (`types.ts:34-47`) already implement progressive depth (5 min → 30 min → 2 hr) and already lead with analogy before terminology — this was true before this proposal and doesn't need to change. The one gap relative to the refinement brief: today a Level 2/3 is a single linear sequence of sections, so if the owner's best mental model for a given concept is visual rather than the way it happened to get written, there's no alternate path through the same content.

The `ContentSection.mode` amendment (§7) closes this gap minimally: an optional tag (`intuition`/`visual`/`analogy`/`formal`) lets a topic carry, say, two Level-2 sections for the same mechanism — one written as a step-by-step narrative, one as a formal/precise description — and the reader picks, rather than the author deciding which single style fits everyone. This is opt-in per topic (existing topics with untagged sections render exactly as they do today) and should only be used where a concept genuinely benefits from more than one framing — not applied uniformly, since most of the existing 29 topics are already well-served by their current single narrative.

## 24. Academy Synchronization — Architecture Only, Not Built Now

The brief is explicit: design for future automation, don't build it yet. The relevant existing precedent is the `update-progress` skill already in this project (per project memory: `feedback_documentation`, `feedback_explainer_updates` — "update project explainer" already means *patch in place*, not regenerate). That skill already does, by hand, exactly the kind of targeted update this section is designing for — the architecture question is just "what does that skill (or a successor) need to be able to patch cleanly."

The reason this proposal's data model choices matter for that future automation, stated explicitly:
- **Every type in §7 is a plain exported TS object/array**, matching the existing `topics.ts`/`features.ts` convention — a future skill can locate `capabilities.ts`'s array, find an entry by `id`, and patch one field (flip `featureId` from `undefined` to a real id, append one `JournalEntry`, bump `Topic.status` from `"planned"` to `"ready"`) with a scoped, reviewable diff. Nothing requires a database migration or a build step beyond what already exists.
- **Structured fields are kept separate from long-form prose fields** on purpose — `featureId`, `status`, `readinessPct`, `principleRefs` are the kind of field a skill patches mechanically; `level2`/`level3`/`discoveryJournal`-successor `JournalEntry` bodies are the kind of field that stays human-authored (or at minimum human-reviewed before merge), because prose quality is exactly the thing automation shouldn't silently degrade.
- **`JournalEntry` is append-only by construction** (§20 — new entries, not edits to old ones) specifically so an automated "record what just shipped" step can safely *add* a row without needing to understand or preserve the semantics of an existing one.
- No synchronization code is proposed here. The concrete next step, if and when this is wanted, is extending the existing `update-progress` skill's scope to include `capabilities.ts`/`decisions.ts`/`journal.ts`, not inventing a new mechanism.

**Update (2026-08-02): the synchronization skill now exists.** `.claude/skills/academy-keeper/SKILL.md` was written against this exact section — it targets the V2 surfaces (Civilization, Capability Graph, Constellation, Atlas, Journal, Decision History, Confidence Heatmap) and explicitly says so in its own file: *until the V2 migration (§8) actually ships, `academy-keeper` has nothing to operate on, so it defers to `update-progress`'s v1 surface map.* **`update-progress` is not retired yet** — it's the only working sync mechanism for the Academy that's actually live in production today. Retire it only after §8 step 10 lands and `academy-keeper` has real V2 files to maintain; retiring it now would leave the current, shipped Academy with no update procedure at all.

Two more session-scoped skills were added alongside it, both reasoning-only (no code-writing tools needed, no dependency on V2 existing):
- **`.claude/skills/mission-control/SKILL.md`** — the lightweight "what should I work on this session" brief: current mission, prerequisites, required knowledge, files, risks. Runs today against CLAUDE.md's roadmap + `.remember/` history; will read the Civilization Map directly once §8 ships.
- **`.claude/skills/reclaim/SKILL.md`** — the heavier "I've been away, rebuild my full mental model before I touch code" walk (Vision → Architecture → Knowledge → Capabilities → Features → Code, ending in a concrete today's-plan). This merges what were drafted as two separate skills (`academy-review` + `reclaim`) into one — both triggered on the identical "returned after a break" moment, and shipping them as two competing skills with near-identical descriptions would have made skill selection ambiguous (the whole point of a skill's `description` field is a distinguishable trigger — two skills claiming the same trigger defeats that). `reclaim` is the fuller version; `mission-control` stays the separate, lighter one for an ordinary session with no context loss.

---

## Closing note on this amendment

Nothing in §19–24 adds a feature the original proposal lacked in spirit — Decision History and Project DNA formalize what `ArchNode.whyThisDesign` and CLAUDE.md's own stated rules already contain; the Engineering Journal is the existing Discovery Journal with real structure instead of free text; Knowledge Debt and the Confidence Heatmap are new *reads* over the same `RingProgress` data, not new data collection burden on the owner; the Civilization Index is a computed rollup, zero new storage; Explanation Style is one optional tag; Academy Synchronization is explicitly "design for it, don't build it." The one real structural change is §7's `RingProgress` moving from a single int to five independent flags — everything else in this amendment is downstream of that one decision, made because a collapsed number cannot represent "I built this without understanding it," which is precisely the failure mode the brief asked this system to catch.
