import type { QA } from "./types";
import { TOPICS } from "./topics";
import { FEATURES } from "./features";

export interface DeckQuestion extends QA {
  id: string;
  source: string; // topic/feature title or "System"
  sourceKind: "topic" | "feature" | "system";
  domainHint: string;
}

// Cross-cutting questions that belong to the project as a whole,
// not to any single topic.
const SYSTEM_QUESTIONS: QA[] = [
  {
    q: "Give me the 90-second overview of AxonFlux.",
    a: "A raw-first analytics platform for a supermarket whose billing software has no API. Staff-exported CSVs land in an append-only raw layer with full lineage; a truncate-and-rebuild pipeline derives ~2.3M rows of time-series analytics (health signals, pseudo-stock, demand forecasts, basket associations); a FastAPI + Next.js dashboard serves staff tools — cash closure, AI campaign studio, entity resolution. Human state lives in a migration-managed app schema that survives rebuilds. The design center: derived data is always a pure function of raw, so every analytics bug is recoverable by re-running SQL.",
  },
  {
    q: "Why did you build this instead of using an off-the-shelf BI tool?",
    a: "BI tools visualize; they don't solve this store's actual problems — a no-API source needing idempotent manual ingestion, product identity resolution across duplicate barcodes, stock reconstruction from flows, and staff workflows like cash closure and AI-generated pamphlets. The dashboard is maybe 20% of the system. And the honest second reason: it's my vehicle for learning production engineering — every component is a deliberately chosen lesson.",
  },
  {
    q: "What's the worst engineering decision in the project right now?",
    a: "The pipeline trigger: an HTTP endpoint spawning an unlocked subprocess — two clicks race on TRUNCATE, failures are invisible. It was the honest v1; the fix (job queue, single-flight lock, status contract) is designed and scheduled. I'd rather name my sharpest edge than pretend there isn't one.",
  },
  {
    q: "Where did you deliberately NOT use AI, and why?",
    a: "Everywhere the answer is computable: mobile normalization (regex), stock position (window functions), basket recommendations (counted lift — an LLM would hallucinate pairings), cash discrepancies (arithmetic), forecasting (gradient boosting beats LLMs on tabular series at 1000x less cost), entity-resolution first pass (string similarity + human review; AI only proposed for the gray zone). Rule: LLMs only where input or output is genuinely unstructured language. Half of AI engineering is refusing AI.",
  },
  {
    q: "How would this system scale to 50 stores?",
    a: "In order of what actually breaks: (1) tenancy — store_id through raw and derived, partition-per-store or schema-per-store; (2) rebuild cost — full rebuilds go incremental (dbt-style) with blue/green swaps; (3) ingestion — per-store batches parallelize on the job queue; (4) reads — cache layer already planned, then read replicas; (5) the LLM gateway and storage layers are already multi-tenant-shaped. What does NOT change: raw immutability, the app/derived split, batch ML scoring. The architecture's bones survive; the materialization strategy is what scale replaces.",
  },
  {
    q: "You're one developer. How do you keep quality without a team?",
    a: "Substitute process for headcount: append-only raw makes my worst bug recoverable; migrations gate schema change; a test baseline covers auth, money math (BOM, closures), and storage contracts; the pipeline is idempotent so re-running is always safe; and every major decision is written down with its alternatives — my future self is the teammate I'm writing for.",
  },
];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
}

export function buildDeck(): DeckQuestion[] {
  const deck: DeckQuestion[] = [];
  SYSTEM_QUESTIONS.forEach((qa, i) =>
    deck.push({ ...qa, id: `sys-${i}-${slug(qa.q)}`, source: "System-wide", sourceKind: "system", domainHint: "system" }),
  );
  TOPICS.forEach((t) =>
    t.interview.forEach((qa, i) =>
      deck.push({ ...qa, id: `t-${t.id}-${i}`, source: t.title, sourceKind: "topic", domainHint: t.domain }),
    ),
  );
  FEATURES.forEach((f) =>
    f.interview.forEach((qa, i) =>
      deck.push({ ...qa, id: `f-${f.id}-${i}`, source: f.title, sourceKind: "feature", domainHint: "feature" }),
    ),
  );
  return deck;
}
