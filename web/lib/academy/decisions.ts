import type { DecisionRecord } from "./types";

/**
 * DECISION HISTORY — why things are the way they are.
 *
 * These are NOT re-authored ADRs. Every entry with an `adrFile` is a structured
 * index into a markdown document that already exists in docs/decisions/ and
 * remains the full text of record; this file exists so the Academy can link a
 * decision to the capabilities, components and principles it touches, which the
 * markdown cannot do.
 *
 * The rule for adding an entry: it belongs here if a future reader could
 * reasonably ask "why on earth is it done this way?" and deserve an answer.
 * If it would still be true regardless of technology, it is a principle
 * instead — put it in dna.ts.
 */
export const DECISIONS: DecisionRecord[] = [
  {
    id: "adr-001-schema-separation",
    title: "Separate raw, derived and app schemas",
    date: "2026-03-01",
    status: "accepted",
    context:
      "One database had to hold three kinds of data with completely different lifecycles: untouchable evidence from the billing exports, analytics that change whenever the logic improves, and human decisions that must survive both.",
    originalApproach:
      "A single analytics schema holding everything, with cleaned data written in place over the imported rows.",
    alternativesConsidered: [
      "One schema, clean-on-write — rejected: destroys the only provable record of what the billing system actually exported.",
      "Separate physical databases per layer — rejected: cross-layer joins are the entire product, and this makes them a distributed problem for no benefit.",
      "Soft-delete flags on raw rows instead of true immutability — rejected: 'immutable unless someone sets a flag' is not immutability.",
    ],
    finalDecision:
      "Three schemas with enforced lifecycles: raw.* append-only, derived.* fully truncated and rebuilt each pipeline run, app.* Alembic-migrated and permanent. app.* enriches derived.* at read time via COALESCE; it never replaces it.",
    tradeoffs:
      "No database-level foreign keys can point at derived.* — it periodically ceases to exist mid-rebuild. Referential integrity across that boundary is a convention the SQL must honour, not something Postgres enforces.",
    lessonsLearned:
      "The invariant is what made everything after it fast. Because a bad derived table is a five-minute rebuild rather than a recovery incident, the analytics layer could be rewritten aggressively without fear — which is exactly where the interesting work happened.",
    adrFile: "docs/decisions/001-app-schema-separation.md",
    principleRefs: ["raw-immutable", "derived-disposable"],
    capabilityIds: ["data-foundation"],
    archNodeIds: ["raw", "derived", "app-schema", "pipeline"],
  },
  {
    id: "adr-002-plugin-tools",
    title: "Auto-discovered tool plugins instead of central registration",
    date: "2026-04-10",
    status: "accepted",
    context:
      "Internal staff tools (cash closure, pamphlets, campaign studio, BOM, entity resolution) were multiplying, each needing routes mounted in main.py.",
    originalApproach: "Import and mount every tool router explicitly in main.py.",
    alternativesConsidered: [
      "Central registration in main.py — rejected: turns one file into a coupling and merge-conflict hotspot that grows with every tool.",
      "A role field on the tool manifest — tried, then removed in July 2026: it looked like access control but enforced nothing, which is worse than no access control because it reads as a guarantee.",
    ],
    finalDecision:
      "Any directory under api/tools/ with an __init__.py declaring a MANIFEST and a router.py is discovered and mounted automatically. Access control stays on the routes themselves, as real dependencies.",
    tradeoffs:
      "Discovery is implicit — a broken plugin fails at import time in a way a static import list would have surfaced more obviously. Worth it for the zero-friction addition of new tools.",
    lessonsLearned:
      "A declarative field that describes security without enforcing it is a liability. Removing `required_role` from the manifest made the system honest: guards live where they are actually checked.",
    adrFile: "docs/decisions/002-plugin-tool-system.md",
    principleRefs: ["capabilities-not-features"],
    capabilityIds: ["campaign-authoring"],
    archNodeIds: ["fastapi"],
  },
  {
    id: "adr-003-entity-resolution",
    title: "Fuzzy product merging with blocking and human confirmation",
    date: "2026-04-25",
    status: "accepted",
    context:
      "The same physical product carried several barcodes, silently splitting its sales across identities and corrupting every downstream signal.",
    originalApproach: "Compare every product name against every other and merge above a similarity threshold.",
    alternativesConsidered: [
      "Naive O(n²) pairwise comparison — rejected on arithmetic: roughly 169 million comparisons for this catalogue.",
      "Fully automatic merging above a high score — rejected: a wrong merge is invisible, permanent and compounding.",
      "Storing aliases in derived.* — rejected: confirmed human decisions would be destroyed by the next pipeline rebuild.",
    ],
    finalDecision:
      "RapidFuzz with prefix and numeric-token blocking to shrink the candidate set; a two-tier threshold (78+ suggested, 62–77 held for review); confirmed aliases stored in app.product_aliases and remapped at the earliest aggregation step so everything downstream inherits the merge.",
    tradeoffs:
      "Blocking can miss a genuine duplicate whose names share no prefix. Accepted: a missed merge is a visible gap, while a false merge is silent corruption. Optimise against the failure you cannot see.",
    lessonsLearned:
      "The 78 threshold is not a general truth — it was tuned against this catalogue's observed false-positive rate. Lowering it without re-validating would quietly reintroduce bad merges.",
    adrFile: "docs/decisions/003-entity-resolution-design.md",
    principleRefs: ["humans-approve", "derived-disposable"],
    capabilityIds: ["product-identity"],
    archNodeIds: ["derived", "app-schema"],
  },
  {
    id: "adr-004-raw-triggers",
    title: "Keep raw dedup triggers outside Alembic",
    date: "2026-04-18",
    status: "accepted",
    context:
      "Alembic migrations failed on fresh databases because raw.* tables do not exist at migration time, and the original DDL called a Supabase-only UUID function unavailable on stock Postgres.",
    originalApproach: "Manage raw.* dedup triggers as ordinary Alembic migrations alongside app.*.",
    alternativesConsidered: [
      "Have Alembic create raw.* too — rejected: raw.* is deliberately outside application migration control, and coupling them means a schema tool can drop evidence.",
      "Application-level dedup checks before insert — rejected: races between concurrent ingests, and it puts a correctness guarantee in the least reliable place.",
    ],
    finalDecision:
      "Alembic never touches raw.* (migration 004 is an intentional no-op). Triggers are installed idempotently by scripts/setup_raw_triggers.py, run once after first ingestion.",
    tradeoffs:
      "The trigger install becomes a manual step no tooling enforces. A fresh production database that skips it silently accepts duplicate rows — the sharpest operational edge in the whole setup path.",
    lessonsLearned:
      "Moving a step outside the migration tool removed a failure but created an invisible prerequisite. Anything that must happen exactly once and is not enforced by tooling needs to be loud in the setup docs — and it still is not loud enough.",
    adrFile: "docs/decisions/004-raw-triggers-outside-alembic.md",
    principleRefs: ["raw-immutable"],
    capabilityIds: ["data-foundation"],
    archNodeIds: ["raw", "ingestion"],
  },
  {
    id: "adr-005-bom-design",
    title: "Mandatory yield ratios for repackaged products",
    date: "2026-05-23",
    status: "accepted",
    context:
      "The shop repackages bulk goods — a wheat sack becomes flour packets. Stock maths treated the sack and the packets as unrelated products, so repackaged items looked like they were bleeding untracked stock.",
    originalApproach: "Map raw product to finished product one-to-one and confirm with a single click.",
    alternativesConsidered: [
      "Default qty_per_unit to 1:1 with optional override — rejected: it would be wrong every day for every BOM product, and the error compounds silently.",
      "Infer yield statistically from historical sales — rejected: it fits noise from unrelated causes (theft, wastage, miscounts) and presents the result with unearned confidence.",
    ],
    finalDecision:
      "A yield ratio is mandatory on every BOM mapping; nothing is confirmed without one. Mappings live in app.* so they survive rebuilds, and step 04 of the pipeline subtracts BOM consumption from raw-product stock.",
    tradeoffs:
      "More staff friction per mapping than a one-click confirm. Accepted deliberately: a wrong yield is not a one-off error, it is a wrong number reproduced every day until someone notices.",
    lessonsLearned:
      "Stock accuracy was the real goal; better ML features were a side effect. Naming the primary goal kept the design from drifting toward what would have been more interesting to build.",
    adrFile: "docs/decisions/005-bom-design.md",
    principleRefs: ["knowledge-before-automation", "humans-approve"],
    capabilityIds: ["stock-truth"],
    archNodeIds: ["derived", "app-schema"],
  },
  {
    id: "adr-006-rbac-lattice",
    title: "A linear role lattice, not permission sets",
    date: "2026-07-26",
    status: "accepted",
    context:
      "Several humans with genuinely different authority needed to share the system: staff who enter data, a manager who verifies it, an owner who administers everything.",
    originalApproach: "A general permission-set model with per-capability grants per user.",
    alternativesConsidered: [
      "Full permission matrix / ACL — rejected as YAGNI: no requirement exists yet for two roles with mutually exclusive powers. The documented trigger to revisit is exactly that 'flip point'.",
      "Middleware-level enforcement — rejected: a route's access rule is most reliable when it is declared on the route itself, where it is visible in review.",
      "Treating machine/API identities as another role — rejected: an API key is not a person and does not belong on a human trust ladder. Deferred to a separate key plane.",
    ],
    finalDecision:
      "ROLE_LEVELS = {staff:1, manager:2, admin:3} with a require_role(minimum) guard factory used per route, a database CHECK constraint on the role column, and a fail-closed default of level 0 for tokens with no role claim.",
    tradeoffs:
      "Genuinely non-hierarchical permissions cannot be expressed. Accepted knowingly, with a written trigger for when to abandon the model rather than bending it.",
    lessonsLearned:
      "Choosing the simplest model that is actually true — rather than the most general one available — made adding a role a one-line change. The frontend mirrors the lattice, which is a real duplication and the thing most likely to drift.",
    adrFile: "docs/decisions/006-rbac-role-lattice.md",
    principleRefs: ["humans-approve"],
    capabilityIds: ["secure-access"],
    archNodeIds: ["fastapi"],
  },
];

export const DECISION_BY_ID: Record<string, DecisionRecord> = Object.fromEntries(
  DECISIONS.map((d) => [d.id, d]),
);

/** Newest first — decision history reads backwards from now. */
export function decisionsChronological(): DecisionRecord[] {
  return [...DECISIONS].sort((a, b) => b.date.localeCompare(a.date));
}

export function decisionsForCapability(capabilityId: string): DecisionRecord[] {
  return DECISIONS.filter((d) => d.capabilityIds.includes(capabilityId));
}

export function decisionsForArchNode(archNodeId: string): DecisionRecord[] {
  return DECISIONS.filter((d) => d.archNodeIds.includes(archNodeId));
}

export function decisionsForPrinciple(principleId: string): DecisionRecord[] {
  return DECISIONS.filter((d) => d.principleRefs.includes(principleId));
}
