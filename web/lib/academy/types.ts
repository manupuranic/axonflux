// AxonFlux Academy — content type system.
// Engine components render these types; all learning content lives in
// data modules (topics.ts, features.ts, ...). Adding content never
// requires touching components — same philosophy as the API tool registry.

export type Domain = "data" | "backend" | "ai" | "ml";
export type Confidence = "none" | "partial" | "solid";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type TopicStatus = "ready" | "planned";

export interface CodeRef {
  path: string; // repo-relative
  note: string;
}

export interface QA {
  q: string;
  a: string;
}

export interface ContentSection {
  heading: string;
  body: string;
  /**
   * V2: optional explanation mode. Lets one concept carry parallel framings of
   * the same mechanism — a step-by-step intuition AND a formal description —
   * so the reader picks the one that fits how they think, instead of the author
   * picking for everyone. Untagged sections render exactly as before.
   */
  mode?: ExplanationMode;
}

/** V2 — see ContentSection.mode. Intuition first is the house style. */
export type ExplanationMode = "intuition" | "visual" | "analogy" | "formal";

export interface Topic {
  id: string;
  title: string;
  domain: Domain;
  difficulty: Difficulty;
  /** "ready" = fully written. "planned" = frontier topic: intuition only, deep content lands when the feature is built. */
  status: TopicStatus;
  tagline: string;
  /** Intuition-first analogy. Always shown before terminology. */
  analogy: string;
  /** The problem that led to this concept's invention. */
  problem: string;
  /** What breaks if we skip it. */
  withoutIt: string;
  prereqs: string[]; // topic ids
  unlocks: string[]; // topic ids
  /** Level 1 — 5 minutes. Plain-language paragraphs. */
  level1: string[];
  /** Level 2 — 30 minutes. Mechanism + examples. */
  level2: ContentSection[];
  /** Level 3 — 2 hours. Trade-offs, failure modes, internals. */
  level3: ContentSection[];
  /** How AxonFlux specifically uses it. */
  axonflux: string;
  /** How real companies use it. */
  companies: string;
  /** When NOT to use it. */
  whenNot: string;
  files: CodeRef[];
  interview: QA[];
  mentor: {
    /** Must understand deeply. */
    deep: string[];
    /** Safe to treat as a black box. */
    abstract: string[];
    /** Common beginner mistakes. */
    mistakes: string[];
  };
  exercises: string[];
  /** Position on the synapse map, 0–100 coordinate space. */
  pos: { x: number; y: number };
}

export interface FlowStep {
  step: string;
  detail: string;
  file?: string;
}

export interface Feature {
  id: string;
  title: string;
  status: "shipped" | "in-progress" | "planned";
  problem: string;
  value: string;
  /** Component chain, rendered as a vertical flow. */
  architecture: string[];
  codeFlow: FlowStep[];
  dbFlow: string[];
  apiFlow: string[];
  theory: string[]; // topic ids
  interview: QA[];
  production: string[];
  improvements: string[];
  files: CodeRef[];
}

export interface ArchNode {
  id: string;
  label: string;
  sublabel: string;
  /** Layout in a 100x100 grid. */
  x: number;
  y: number;
  w: number;
  h: number;
  tone: Domain | "external";
  purpose: string;
  responsibilities: string[];
  whyThisDesign: string;
  alternatives: string;
  tradeoffs: string;
  interview: string[];
  files: CodeRef[];
  relatedTopics: string[]; // topic ids
  /**
   * V2 confidence heatmap: how well *I* understand this component. This is a
   * self-assessment of understanding — NOT code quality, test coverage, or
   * how good the component is. A well-built component I've forgotten is "none";
   * a hacky one I wrote yesterday is "solid". Undefined = never assessed.
   */
  myConfidence?: Confidence;
}

export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Challenge {
  id: string;
  title: string;
  topicId: string;
  difficulty: Difficulty;
  brief: string;
  requirements: string[];
  hints: string[];
  solutionFiles: CodeRef[];
  solutionNotes: string[];
}

export interface RoadmapPhase {
  id: string;
  phase: number;
  title: string;
  goal: string;
  mvp: boolean;
  dependencies: string;
  features: { name: string; difficulty: Difficulty }[];
  concepts: string[];
  companies: string;
  /** 1–5 ratings. */
  learningValue: number;
  interviewValue: number;
  productionValue: number;
  complexity: number;
  resume: string;
}

export const DOMAIN_META: Record<
  Domain,
  { label: string; color: string; bg: string; border: string; text: string }
> = {
  data: {
    label: "Data Engineering",
    color: "#0891b2",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-700",
  },
  backend: {
    label: "Backend Engineering",
    color: "#105dff",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
  },
  ml: {
    label: "Machine Learning",
    color: "#db2777",
    bg: "bg-pink-50",
    border: "border-pink-200",
    text: "text-pink-700",
  },
  ai: {
    label: "AI Engineering",
    color: "#7c3aed",
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
  },
};

export const CONFIDENCE_META: Record<
  Confidence,
  { label: string; color: string; ring: string }
> = {
  none: { label: "Not yet", color: "#94a3b8", ring: "ring-slate-300" },
  partial: { label: "Partially", color: "#d97706", ring: "ring-amber-400" },
  solid: { label: "I own this", color: "#059669", ring: "ring-emerald-500" },
};

export const DIFFICULTY_META: Record<Difficulty, { label: string; cls: string }> = {
  beginner: { label: "Beginner", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  intermediate: { label: "Intermediate", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  advanced: { label: "Advanced", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMY V2 — capability-first layer
//
// Everything above stays the authored leaf content. Everything below is a
// *reference* layer on top of it: civilization nodes point at topic ids,
// capabilities point at feature/arch/challenge ids. Nothing below duplicates
// content that already exists above — that is the whole design constraint.
// See docs/superpowers/specs/2026-08-02-academy-v2-redesign.md
// ─────────────────────────────────────────────────────────────────────────────

/** The five independent progression trees. */
export type CivilizationId =
  | "engineering"
  | "ai"
  | "cs"
  | "system-design"
  | "retail-intel";

/**
 * Knowledge Rings — five independent flags, deliberately NOT one 0–5 integer.
 *
 * A single int can only express "how far along" and therefore cannot represent
 * a broken ladder. The state that matters most here is `implement: true` while
 * `theory: false` — "I shipped this without understanding it" — which is a real
 * pattern in this project's own history and is exactly what Knowledge Debt
 * exists to surface. Collapsed into an int, that state is indistinguishable
 * from honest progress. So: five booleans.
 */
export interface RingProgress {
  /** Ring 1 — do I understand it? */
  theory: boolean;
  /** Ring 2 — can I teach it? */
  explain: boolean;
  /** Ring 3 — have I built it? */
  implement: boolean;
  /** Ring 4 — is it live inside AxonFlux? */
  production: boolean;
  /** Ring 5 — would I discuss it confidently in an interview? */
  mastery: boolean;
  /** ISO date of the last flag change. Staleness input for "known but forgotten". */
  lastTouchedAt: string;
}

export const EMPTY_RINGS: RingProgress = {
  theory: false,
  explain: false,
  implement: false,
  production: false,
  mastery: false,
  lastTouchedAt: "",
};

export type RingName = "theory" | "explain" | "implement" | "production" | "mastery";

/** Ordered — index+1 is the ring number, and order defines the honest ladder. */
export const RING_ORDER: RingName[] = [
  "theory",
  "explain",
  "implement",
  "production",
  "mastery",
];

export const RING_META: Record<RingName, { label: string; question: string }> = {
  theory: { label: "Theory", question: "Do I understand it?" },
  explain: { label: "Explain", question: "Can I teach it?" },
  implement: { label: "Implement", question: "Have I built it?" },
  production: { label: "Production", question: "Is it used inside AxonFlux?" },
  mastery: { label: "Mastery", question: "Could I defend it in an interview?" },
};

/**
 * Knowledge Debt — always DERIVED from RingProgress, never authored by hand.
 * If the owner had to remember to mark their own debt, the weakest areas are
 * exactly the ones that would go unmarked.
 */
export type KnowledgeDebt =
  | "none"
  | "unknown"
  | "known-but-forgotten"
  | "understood-but-not-implemented"
  | "implemented-but-not-understood";

export const DEBT_META: Record<
  KnowledgeDebt,
  { label: string; hint: string; tone: "neutral" | "warn" | "alert" }
> = {
  none: { label: "Current", hint: "No gap worth flagging.", tone: "neutral" },
  unknown: { label: "Unknown", hint: "Not started. Honest zero.", tone: "neutral" },
  "known-but-forgotten": {
    label: "Forgotten",
    hint: "Understood once, untouched for a long time. Re-read before relying on it.",
    tone: "warn",
  },
  "understood-but-not-implemented": {
    label: "Untested by hand",
    hint: "Theory only. You have never built it — that gap shows up under interview pressure.",
    tone: "warn",
  },
  "implemented-but-not-understood": {
    label: "Shipped, not understood",
    hint: "It runs in production and you cannot fully explain it. Highest-priority debt.",
    tone: "alert",
  },
};

/**
 * A milestone in a civilization tree. Holds no content of its own — it is a
 * named threshold over topics that already exist.
 */
export interface CivilizationNode {
  id: string;
  civilization: CivilizationId;
  title: string;
  /** Why this rung matters — one line, capability-framed, not technology-framed. */
  unlocks: string;
  /** Constellation topics this milestone is made of. */
  topicIds: string[];
  /** Node counts as reached when every referenced topic has this ring set. */
  minRing: RingName;
  prereqNodes: string[];
  /** Presentational tier within the tree. 1-indexed. */
  age: number;
  /** Honest marker: no topic authored for this rung yet. */
  contentGap?: boolean;
}

export interface CivilizationMeta {
  label: string;
  tagline: string;
  color: string;
  bg: string;
  border: string;
  text: string;
}

/**
 * Colour carries meaning here, per the V2 brief: blue=engineering, purple=AI,
 * green=retail. CS and system-design get their own hues so a node's tree is
 * readable without a legend. Parallel in shape to DOMAIN_META so components can
 * treat them interchangeably.
 */
export const CIVILIZATION_META: Record<CivilizationId, CivilizationMeta> = {
  engineering: {
    label: "Engineering",
    tagline: "Make it run, make it safe, make it survive you.",
    color: "#105dff",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
  },
  ai: {
    label: "AI",
    tagline: "From a prompt to a system that acts on its own reasoning.",
    color: "#7c3aed",
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
  },
  cs: {
    label: "Computer Science",
    tagline: "The primitives everything above is secretly made of.",
    color: "#0891b2",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-700",
  },
  "system-design": {
    label: "System Design",
    tagline: "What breaks when one machine is no longer enough.",
    color: "#c2410c",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
  },
  "retail-intel": {
    label: "Retail Intelligence",
    tagline: "Turning a shop's exhaust data into decisions.",
    color: "#059669",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
  },
};

/** One timeless principle. This list should grow very slowly. */
export interface DNAPrinciple {
  id: string;
  statement: string;
  rationale: string;
  /** What this principle costs — a principle with no cost is a slogan. */
  cost: string;
  /** ArchNode / Capability / DecisionRecord ids that embody it. */
  examples: string[];
}

/**
 * Structured decision memory. ArchNode already carries whyThisDesign/
 * alternatives/tradeoffs inline; this type is the reusable version for
 * decisions that no single ArchNode owns, and the wrapper for real ADRs.
 */
export interface DecisionRecord {
  id: string;
  title: string;
  /** ISO date. */
  date: string;
  status: "accepted" | "superseded" | "proposed";
  context: string;
  originalApproach: string;
  alternativesConsidered: string[];
  finalDecision: string;
  tradeoffs: string;
  lessonsLearned: string;
  /** Repo-relative path when a real ADR already exists — never re-author it here. */
  adrFile?: string;
  supersededBy?: string;
  principleRefs: string[];
  capabilityIds: string[];
  archNodeIds: string[];
}

/**
 * Engineering Journal — append-only. New milestone = new entry, never an edit
 * to an old one. Mistakes and rejected ideas are first-class fields: history
 * that only records successes is marketing, not memory.
 */
export interface JournalEntry {
  id: string;
  capabilityId: string;
  /** ISO date. */
  date: string;
  title: string;
  problem: string;
  assumptions: string[];
  experiments: string[];
  rejectedIdeas: string[];
  mistakes: string[];
  finalSolution: string;
  futureImprovements: string[];
}

export type CapabilityStatus =
  | "built"
  | "in-progress"
  | "next"
  | "planned"
  | "blocked";

export const CAPABILITY_STATUS_META: Record<
  CapabilityStatus,
  { label: string; cls: string }
> = {
  built: { label: "Built", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "in-progress": { label: "In progress", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  next: { label: "Next unlock", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  planned: { label: "Planned", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  blocked: { label: "Blocked", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

/**
 * A Capability is a mission: "what can I now DO?". It owns no theory and no
 * implementation detail — it points at the Constellation topics it needs and
 * the Atlas features/components that realise it.
 */
export interface Capability {
  id: string;
  title: string;
  civilizations: CivilizationId[];
  status: CapabilityStatus;
  /** One line, in plain language, of what this lets a human do. */
  mission: string;
  businessValue: string;
  /** What becomes newly true once this ships. Drives "Today's Mission". */
  expectedOutcome: string;
  /** Named honestly when status is "blocked" — what exactly is in the way. */
  blockedBy?: string;
  prereqCapabilities: string[];
  unlocksCapabilities: string[];
  requiredTopicIds: string[];
  /** Set once the capability actually ships. undefined = not built yet. */
  featureId?: string;
  archNodeIds: string[];
  rebuildChallengeIds: string[];
  decisionRecordIds: string[];
  journalEntryIds: string[];
  principleRefs: string[];
  interview: QA[];
}
