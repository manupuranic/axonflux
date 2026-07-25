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
}

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
