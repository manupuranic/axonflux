import type { Capability } from "./types";

/**
 * THE CAPABILITY GRAPH — the heart of Academy V2.
 *
 * A capability answers "what can I now DO?", never "what technology is this?".
 * It owns no theory and no implementation detail: `requiredTopicIds` points at
 * Constellation topics, `featureId`/`archNodeIds` point at the Atlas. When a
 * capability ships, the only edit needed here is flipping `status` and setting
 * `featureId` — everything else is already a reference.
 *
 * The first nine entries are capabilities that ALREADY EXIST. They are listed
 * first and deliberately: a progression system whose every node reads "planned"
 * teaches its owner that they have built nothing, which is both false and
 * demoralising. The forward-looking entries build on top of them.
 *
 * Deliberately absent: a Voice Agent. It appears in no roadmap, ADR, or topic
 * in this repo. A locked node with no real plan behind it would break the
 * promise that everything locked is genuinely sequenced future work.
 */
export const CAPABILITIES: Capability[] = [
  // ── Built ────────────────────────────────────────────────────────────────
  {
    id: "data-foundation",
    title: "Trustworthy Data Foundation",
    civilizations: ["retail-intel", "engineering"],
    status: "built",
    mission: "Turn hand-exported billing files into analytics nobody has to second-guess.",
    businessValue:
      "Every number in the product — every dashboard, signal and restock suggestion — is downstream of this. Without it there is no platform, only spreadsheets.",
    expectedOutcome:
      "Any analytical table can be dropped and rebuilt from raw in one command, with full file-level lineage.",
    prereqCapabilities: [],
    unlocksCapabilities: ["customer-intelligence", "product-identity", "demand-signal"],
    requiredTopicIds: ["three-layer-architecture", "idempotent-rebuilds", "postgres-optimization"],
    featureId: "data-pipeline",
    archNodeIds: ["ingestion", "raw", "pipeline", "derived"],
    rebuildChallengeIds: [],
    decisionRecordIds: ["adr-001-schema-separation", "adr-004-raw-triggers"],
    journalEntryIds: ["journal-derived-view-to-table"],
    principleRefs: ["raw-immutable", "derived-disposable"],
    interview: [
      {
        q: "Why is the raw layer append-only rather than cleaned on write?",
        a: "The billing system has no API, so the export IS the evidence. Cleaning on write destroys the only provable record of what the store actually did. We pay for that on every read instead — a deliberate, permanent trade.",
      },
    ],
  },
  {
    id: "secure-access",
    title: "Multi-User Access Control",
    civilizations: ["engineering"],
    status: "built",
    mission: "Let staff, managers and the owner share one system without sharing one trust level.",
    businessValue:
      "Cash verification and destructive operations stay with the people accountable for them.",
    expectedOutcome:
      "Every endpoint declares its own minimum role; a token with a junk role is refused rather than defaulted.",
    prereqCapabilities: [],
    unlocksCapabilities: ["cash-integrity", "purchase-planner"],
    requiredTopicIds: ["jwt-auth", "rbac", "dependency-injection"],
    featureId: "auth-rbac",
    archNodeIds: ["fastapi"],
    rebuildChallengeIds: ["rebuild-jwt-flow", "rebuild-rbac"],
    decisionRecordIds: ["adr-006-rbac-lattice"],
    journalEntryIds: [],
    principleRefs: ["humans-approve"],
    interview: [
      {
        q: "Why a linear role lattice instead of a permission matrix?",
        a: "Because the domain genuinely is hierarchical — three humans, three trust levels. A lattice is the simplest model that is actually true, and adding a role is one dict line. A permission set would have been architecture bought on credit against a requirement that does not exist yet.",
      },
    ],
  },
  {
    id: "customer-intelligence",
    title: "Customer Intelligence",
    civilizations: ["retail-intel"],
    status: "built",
    mission: "Recognise returning customers in a stream of anonymous cash bills.",
    businessValue:
      "Identifies who has stopped coming back while winning them back is still cheap.",
    expectedOutcome:
      "Every bill resolves to a normalised mobile or the WALK-IN pool, with recency tiers computed per customer.",
    prereqCapabilities: ["data-foundation"],
    unlocksCapabilities: ["marketing-agent"],
    requiredTopicIds: ["sql-window-functions"],
    featureId: "customer-analytics",
    archNodeIds: ["derived"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["no-pii-crosses-boundary"],
    interview: [
      {
        q: "Customer mobiles arrive in four formats. Where do you normalise, and why there?",
        a: "In the derived layer, never in raw — raw keeps whatever the export contained. Normalising downstream means a bug in the rule is a rebuild away from fixed, instead of a permanent corruption of the source.",
      },
    ],
  },
  {
    id: "product-identity",
    title: "Single Product Identity",
    civilizations: ["retail-intel"],
    status: "built",
    mission: "Collapse the many barcodes that mean one physical product into one identity.",
    businessValue:
      "Split identities silently halve a product's apparent sales, corrupting every signal built on top.",
    expectedOutcome:
      "Confirmed aliases remap at the earliest aggregation step, so every downstream table inherits the merge for free.",
    prereqCapabilities: ["data-foundation"],
    unlocksCapabilities: ["inventory-agent", "forecast-agent"],
    requiredTopicIds: ["entity-resolution"],
    featureId: "entity-resolution-feature",
    archNodeIds: ["derived", "app-schema"],
    rebuildChallengeIds: [],
    decisionRecordIds: ["adr-003-entity-resolution"],
    journalEntryIds: [],
    principleRefs: ["humans-approve", "derived-disposable"],
    interview: [
      {
        q: "Why does a human confirm every merge instead of auto-applying high scores?",
        a: "A wrong merge is invisible and compounding — two different products silently become one forever. Blocking is cheap; unwinding is not. The threshold was tuned empirically at 78 against this specific catalogue's false-positive rate.",
      },
    ],
  },
  {
    id: "stock-truth",
    title: "Stock Position Truth",
    civilizations: ["retail-intel"],
    status: "built",
    // No entry in features.ts yet — the BOM Manager shipped without a case
    // study being written. A real, honest content gap for the Atlas to fill.
    mission: "Track stock through in-house repackaging, where one raw sack becomes many sold units.",
    businessValue:
      "Without it, every repackaged product looks like it is haemorrhaging stock that was never actually sold.",
    expectedOutcome:
      "Pseudo-stock accounts for BOM consumption with real yield ratios, not 1:1 assumptions.",
    prereqCapabilities: ["data-foundation", "product-identity"],
    unlocksCapabilities: ["inventory-agent", "purchase-planner"],
    requiredTopicIds: ["sql-window-functions"],
    archNodeIds: ["derived", "app-schema"],
    rebuildChallengeIds: ["rebuild-pseudo-stock"],
    decisionRecordIds: ["adr-005-bom-design"],
    journalEntryIds: [],
    principleRefs: ["knowledge-before-automation"],
    interview: [
      {
        q: "Why is yield mandatory rather than defaulting to 1:1?",
        a: "Repackaging loses real mass — wheat to flour, groundnut to oil. A 1:1 default would be wrong every single day for every BOM product, and the error compounds. One extra field of staff friction beats permanently wrong stock maths.",
      },
    ],
  },
  {
    id: "cash-integrity",
    title: "Cash Integrity",
    civilizations: ["retail-intel"],
    status: "built",
    mission: "Reconcile what the system says was collected against what is physically in the drawer.",
    businessValue: "Surfaces till discrepancies the same night, not at month end.",
    expectedOutcome:
      "Staff submit a counted closure; a manager verifies or rejects it. The approval pattern here is the template every future agent reuses.",
    prereqCapabilities: ["secure-access", "data-foundation"],
    unlocksCapabilities: ["multi-agent-coordinator"],
    requiredTopicIds: ["rbac"],
    featureId: "cash-closure",
    archNodeIds: ["fastapi", "app-schema"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["humans-approve"],
    interview: [
      {
        q: "Why does this live in app.* rather than derived.*?",
        a: "It is human-authored state. derived.* is truncated on every pipeline run — a cash count stored there would evaporate on the next rebuild. That split is the schema separation principle doing its job.",
      },
    ],
  },
  {
    id: "campaign-authoring",
    title: "AI Campaign Authoring",
    civilizations: ["retail-intel", "ai"],
    status: "built",
    mission: "Design multi-format promotional material by describing changes in plain language.",
    businessValue:
      "Turns a design task that needed external help into an in-house, minutes-long job.",
    expectedOutcome:
      "One canvas exports to A4, A5, WhatsApp, Instagram and Facebook because format is data, not a code branch.",
    prereqCapabilities: ["asset-pipeline"],
    unlocksCapabilities: ["campaign-intelligence", "marketing-agent"],
    requiredTopicIds: ["tool-calling", "structured-outputs", "provider-abstraction"],
    featureId: "campaign-studio",
    archNodeIds: ["ai-layer", "llm-providers", "nextjs"],
    rebuildChallengeIds: ["rebuild-tool-loop"],
    decisionRecordIds: ["adr-002-plugin-tools"],
    journalEntryIds: ["journal-set-theme-provider-wiring"],
    principleRefs: ["capabilities-not-features"],
    interview: [
      {
        q: "Why is export format stored as data rather than branched in code?",
        a: "Five formats as five code paths means every new node type is implemented five times. As rows, the renderer stays format-agnostic and a sixth format is a row, not a refactor.",
      },
    ],
  },
  {
    id: "asset-pipeline",
    title: "Portable Asset Storage",
    civilizations: ["engineering"],
    status: "built",
    mission: "Store and serve images without binding the codebase to one cloud vendor.",
    businessValue: "Switching storage provider is an env-var change, not a migration project.",
    expectedOutcome:
      "One StorageClient interface, two implementations (local disk, S3-compatible R2), chosen at runtime.",
    prereqCapabilities: [],
    unlocksCapabilities: ["campaign-authoring", "vision-agent", "storefront-agent"],
    requiredTopicIds: ["dependency-injection", "plugin-architecture"],
    featureId: "storage-abstraction",
    archNodeIds: ["storage"],
    rebuildChallengeIds: ["rebuild-provider-port"],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["capabilities-not-features"],
    interview: [
      {
        q: "What makes this a port rather than just a wrapper?",
        a: "The interface is written in the language of the application ('upload this image, give me a URL'), not the language of S3. That is what lets a local-disk implementation satisfy it honestly.",
      },
    ],
  },
  {
    id: "demand-signal",
    title: "Demand Signal (Baseline)",
    civilizations: ["retail-intel"],
    status: "built",
    mission: "Give every product a predicted daily demand and a fast/slow/dead/spike classification.",
    businessValue: "Turns 4,000+ products into a short list worth a human's attention.",
    expectedOutcome:
      "A weighted moving average in SQL producing health signals — deliberately simple, and the baseline any ML model must beat.",
    prereqCapabilities: ["data-foundation"],
    unlocksCapabilities: ["forecast-agent", "inventory-agent"],
    requiredTopicIds: ["sql-window-functions", "demand-forecasting"],
    featureId: "demand-forecasting-feature",
    archNodeIds: ["derived", "ml-stack"],
    rebuildChallengeIds: ["rebuild-pseudo-stock"],
    decisionRecordIds: [],
    journalEntryIds: ["journal-mlflow-baseline-oom"],
    principleRefs: ["knowledge-before-automation"],
    interview: [
      {
        q: "Why ship a SQL weighted moving average before any ML?",
        a: "It gave a working signal in days and, more importantly, a baseline. A forecasting model with no baseline cannot be shown to be worth its complexity — 'it predicts things' is not a result.",
      },
    ],
  },

  // ── In progress / next ───────────────────────────────────────────────────
  {
    id: "forecast-agent",
    title: "Forecast Agent",
    civilizations: ["retail-intel", "ai"],
    status: "in-progress",
    mission: "Replace the SQL baseline with a validated model that measurably beats it.",
    businessValue: "Better demand estimates flow straight into ordering quantities and dead-stock calls.",
    expectedOutcome:
      "A model beating the WMA baseline on held-out data, promoted into the pipeline as a predict step writing p10/p50/p90.",
    prereqCapabilities: ["demand-signal", "product-identity"],
    unlocksCapabilities: ["purchase-planner", "inventory-agent"],
    requiredTopicIds: ["demand-forecasting", "mlflow-tracking", "llm-evals"],
    archNodeIds: ["ml-stack", "app-schema"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["knowledge-before-automation"],
    interview: [
      {
        q: "What would make you abandon the ML model and keep the SQL baseline?",
        a: "If it fails to beat WMA on held-out data by a margin worth its operational cost. A model that ties with a five-line SQL rule is a liability — more moving parts, same answer.",
      },
    ],
  },
  {
    id: "information-agent",
    title: "Information Agent",
    civilizations: ["retail-intel", "ai"],
    status: "next",
    mission: "Ask the shop a plain-language question and get a real number back from real data.",
    businessValue: "Removes the dashboard-literacy barrier between the owner and their own data.",
    expectedOutcome:
      "A tool-calling loop over the existing read endpoints — grounded answers, no new SQL, no hallucinated figures.",
    prereqCapabilities: ["data-foundation", "customer-intelligence", "demand-signal"],
    unlocksCapabilities: ["analytics-agent", "retail-copilot"],
    requiredTopicIds: ["tool-calling", "structured-outputs", "provider-abstraction"],
    archNodeIds: ["ai-layer", "fastapi"],
    rebuildChallengeIds: ["rebuild-tool-loop"],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["capabilities-not-features", "knowledge-before-automation"],
    interview: [
      {
        q: "Why is this the cheapest possible first agent?",
        a: "It writes nothing and needs no new data. Every tool it calls is an endpoint already shipped and tested, so it validates the agent loop itself without also gambling on new queries being correct.",
      },
    ],
  },

  // ── Planned ──────────────────────────────────────────────────────────────
  {
    id: "inventory-agent",
    title: "Inventory Agent",
    civilizations: ["retail-intel"],
    status: "planned",
    mission: "Watch stock cover and flag what is about to run out or has already died.",
    businessValue: "Prevents stockouts on fast movers and capital rotting in dead stock.",
    expectedOutcome: "A daily ranked list of stock risks, each with the evidence behind it.",
    prereqCapabilities: ["stock-truth", "demand-signal"],
    unlocksCapabilities: ["purchase-planner"],
    requiredTopicIds: ["sql-window-functions", "tool-calling"],
    archNodeIds: ["derived", "ai-layer"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["humans-approve"],
    interview: [],
  },
  {
    id: "analytics-agent",
    title: "Analytics Agent",
    civilizations: ["retail-intel", "ai"],
    status: "planned",
    mission: "Explain movements, not just report them — why did Tuesday drop?",
    businessValue: "Compresses an analyst's comparison work into a paragraph a human can act on.",
    expectedOutcome: "Multi-step reasoning across periods and signals, with its evidence chain shown.",
    prereqCapabilities: ["information-agent"],
    unlocksCapabilities: ["retail-copilot"],
    requiredTopicIds: ["tool-calling", "agents-orchestration", "llm-evals"],
    archNodeIds: ["ai-layer"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["knowledge-before-automation"],
    interview: [],
  },
  {
    id: "purchase-planner",
    title: "Purchase Planner",
    civilizations: ["retail-intel", "ai"],
    status: "planned",
    mission: "Draft a per-supplier purchase order the owner only has to approve or edit.",
    businessValue: "Ordering is the highest-frequency, highest-cost recurring decision in the shop.",
    expectedOutcome: "Parallel per-supplier drafts merged into one review queue. Never auto-sent.",
    blockedBy: "No shared agent run/output audit tables exist yet — see multi-agent-coordinator.",
    prereqCapabilities: ["stock-truth", "forecast-agent", "secure-access"],
    unlocksCapabilities: [],
    requiredTopicIds: ["agents-orchestration", "tool-calling", "structured-outputs"],
    archNodeIds: ["ai-layer", "derived"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["humans-approve"],
    interview: [
      {
        q: "What is the failure mode you are most guarding against here?",
        a: "A confidently wrong order that a human waves through. That is why the output has to show the evidence per line, not just a quantity — approval has to be possible without re-deriving the maths.",
      },
    ],
  },
  {
    id: "marketing-agent",
    title: "Marketing Agent",
    civilizations: ["retail-intel", "ai"],
    status: "planned",
    mission: "Propose what should go in the next campaign, from demand, expiry risk and basket data.",
    businessValue: "Replaces intuition-picked promo lists with evidence-picked ones.",
    expectedOutcome: "A 'Suggest Products' action inside Campaign Studio that fills the product list.",
    prereqCapabilities: ["campaign-authoring", "customer-intelligence"],
    unlocksCapabilities: ["campaign-intelligence"],
    requiredTopicIds: ["basket-analysis", "tool-calling"],
    archNodeIds: ["ai-layer", "derived"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["humans-approve"],
    interview: [],
  },
  {
    id: "campaign-intelligence",
    title: "Campaign Intelligence",
    civilizations: ["retail-intel"],
    status: "planned",
    mission: "Close the loop: did the campaign actually move the products it promoted?",
    businessValue: "Without measurement, every campaign is a guess repeated.",
    expectedOutcome: "Per-campaign lift measurement against a pre-campaign baseline.",
    prereqCapabilities: ["marketing-agent"],
    unlocksCapabilities: [],
    requiredTopicIds: ["llm-evals", "basket-analysis"],
    archNodeIds: ["derived"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["knowledge-before-automation"],
    interview: [],
  },
  {
    id: "vision-agent",
    title: "Vision Agent",
    civilizations: ["ai"],
    status: "planned",
    mission: "Generalise the working pamphlet image-scan agent beyond one tool.",
    businessValue: "Product photography and label reading are manual bottlenecks today.",
    expectedOutcome: "One image-understanding service usable by any tool, not just pamphlets.",
    prereqCapabilities: ["asset-pipeline", "campaign-authoring"],
    unlocksCapabilities: ["storefront-agent"],
    requiredTopicIds: ["structured-outputs", "provider-abstraction"],
    archNodeIds: ["ai-layer", "storage"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["capabilities-not-features"],
    interview: [],
  },
  {
    id: "storefront-agent",
    title: "Storefront Agent Group",
    civilizations: ["retail-intel", "engineering"],
    status: "planned",
    mission: "Publish a public catalogue from private data without leaking anything private.",
    businessValue: "A searchable public presence for a shop that currently has none.",
    expectedOutcome: "A static export built from a curated snapshot — no live DB reachable from the public site.",
    prereqCapabilities: ["asset-pipeline", "vision-agent"],
    unlocksCapabilities: [],
    requiredTopicIds: ["plugin-architecture", "structured-outputs"],
    archNodeIds: ["storage", "nextjs"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["no-pii-crosses-boundary"],
    interview: [],
  },

  // ── Blocked ──────────────────────────────────────────────────────────────
  {
    id: "multi-agent-coordinator",
    title: "Agent Runtime & Coordinator",
    civilizations: ["ai", "engineering"],
    status: "blocked",
    mission: "One shared way for every agent to run, record what it did, and wait for approval.",
    businessValue:
      "Built once, every later agent is domain logic only. Skipped, seven agents each invent their own audit trail.",
    expectedOutcome:
      "app.agent_runs + app.agent_outputs, plus one reusable approval queue generalised from Cash Closure.",
    blockedBy:
      "The two audit tables do not exist. This is the single shared blocker in front of every Phase D agent.",
    prereqCapabilities: ["cash-integrity", "secure-access"],
    unlocksCapabilities: ["purchase-planner", "analytics-agent", "inventory-agent"],
    requiredTopicIds: ["agents-orchestration", "background-workers", "event-driven-outbox"],
    archNodeIds: ["app-schema", "fastapi", "ai-layer"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["humans-approve", "capabilities-not-features"],
    interview: [
      {
        q: "Why build this before any of the agents that need it?",
        a: "Because the alternative is discovering the shared shape on the seventh agent, after six bespoke audit implementations have already diverged. The cost of the abstraction is paid once; the cost of skipping it is paid every time.",
      },
    ],
  },
  {
    id: "retail-copilot",
    title: "Retail Copilot",
    civilizations: ["retail-intel", "ai"],
    status: "blocked",
    mission: "One conversational surface over the entire shop — products, customers, stock, cash.",
    businessValue: "The owner stops navigating software and starts asking questions.",
    expectedOutcome: "Retrieval-grounded answers spanning catalogue semantics, not just numeric lookups.",
    blockedBy:
      "No embeddings and no pgvector yet; product descriptions do not exist either, so there is little worth embedding.",
    prereqCapabilities: ["information-agent", "analytics-agent"],
    unlocksCapabilities: [],
    requiredTopicIds: ["rag", "embeddings", "vector-search", "conversation-memory"],
    archNodeIds: ["ai-layer", "app-schema"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["no-pii-crosses-boundary", "knowledge-before-automation"],
    interview: [],
  },
  {
    id: "memory-agent",
    title: "Persistent Agent Memory",
    civilizations: ["ai"],
    status: "blocked",
    mission: "Let agents remember across sessions instead of restarting cold every time.",
    businessValue: "Repeated context re-explaining is the main cost of conversational tools.",
    expectedOutcome: "A durable memory store agents read from and append to.",
    blockedBy:
      "An unresolved design question, not missing code: should long-term memory live in AxonFlux at all, or in Manastra with AxonFlux staying stateless behind its read-only MCP boundary?",
    prereqCapabilities: ["information-agent"],
    unlocksCapabilities: [],
    requiredTopicIds: ["conversation-memory", "embeddings"],
    archNodeIds: ["app-schema", "ai-layer"],
    rebuildChallengeIds: [],
    decisionRecordIds: [],
    journalEntryIds: [],
    principleRefs: ["no-pii-crosses-boundary"],
    interview: [],
  },
];

export const CAPABILITY_BY_ID: Record<string, Capability> = Object.fromEntries(
  CAPABILITIES.map((c) => [c.id, c]),
);

export function capabilityTitle(id: string): string {
  return CAPABILITY_BY_ID[id]?.title ?? id;
}

/** Capabilities that reference a given topic — "why am I learning this?". */
export function capabilitiesForTopic(topicId: string): Capability[] {
  return CAPABILITIES.filter((c) => c.requiredTopicIds.includes(topicId));
}

/** Capability dependency edges, for the capability graph view. */
export const CAPABILITY_EDGES: { from: string; to: string }[] = CAPABILITIES.flatMap(
  (c) =>
    c.prereqCapabilities
      .filter((p) => CAPABILITY_BY_ID[p])
      .map((p) => ({ from: p, to: c.id })),
);

/**
 * The current mission: the "next" capability if one is declared, else the
 * capability furthest along without being finished. Deliberately singular —
 * the home page must answer "what now?" with one answer, not a menu.
 */
export function currentMission(): Capability | undefined {
  return (
    CAPABILITIES.find((c) => c.status === "next") ??
    CAPABILITIES.find((c) => c.status === "in-progress")
  );
}

export function builtCapabilities(): Capability[] {
  return CAPABILITIES.filter((c) => c.status === "built");
}
