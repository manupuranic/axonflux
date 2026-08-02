import type {
  CivilizationId,
  CivilizationNode,
  RingName,
  RingProgress,
} from "./types";
import { TOPIC_BY_ID } from "./topics";

/**
 * CIVILIZATION TREES — the motivational layer.
 *
 * A civilization node owns no content. It is a named threshold over topics that
 * already exist in the Constellation: "this milestone is reached when these
 * topics are at this ring". That indirection is the whole point — a tree can be
 * re-shaped, re-ordered, or re-worded without touching a single line of the
 * authored theory underneath it.
 *
 * Three trees are seeded here because all three reference topics that are
 * already written. Computer Science and System Design are declared in
 * CIVILIZATIONS but intentionally have no nodes yet: their content is genuinely
 * net-new writing, and an honestly empty tree is better than one padded with
 * shallow nodes that lie about what has been learned.
 */

/** Reached = the named ring flag is true on every referenced topic. */
function ringSet(rings: RingProgress, ring: RingName): boolean {
  return rings[ring];
}

export const ENGINEERING_TREE: CivilizationNode[] = [
  {
    id: "eng-service-foundations",
    civilization: "engineering",
    title: "Service Foundations",
    unlocks: "Code that can be extended without editing its own core.",
    topicIds: ["dependency-injection", "plugin-architecture"],
    minRing: "implement",
    prereqNodes: [],
    age: 1,
  },
  {
    id: "eng-data-layer",
    civilization: "engineering",
    title: "The Immutable Data Layer",
    unlocks: "Analytics you can rebuild fearlessly, because raw is never touched.",
    topicIds: ["three-layer-architecture", "idempotent-rebuilds"],
    minRing: "implement",
    prereqNodes: [],
    age: 1,
  },
  {
    id: "eng-database",
    civilization: "engineering",
    title: "Database Fluency",
    unlocks: "Answering time-series questions in SQL instead of in application loops.",
    topicIds: ["sql-window-functions", "postgres-optimization"],
    minRing: "implement",
    prereqNodes: ["eng-data-layer"],
    age: 2,
  },
  {
    id: "eng-api-security",
    civilization: "engineering",
    title: "Identity & Access",
    unlocks: "Multiple humans using one system without trusting each other equally.",
    topicIds: ["jwt-auth", "rbac"],
    minRing: "production",
    prereqNodes: ["eng-service-foundations"],
    age: 2,
  },
  {
    id: "eng-async-work",
    civilization: "engineering",
    title: "Work That Outlives A Request",
    unlocks: "Long jobs and hot reads stop blocking the user.",
    topicIds: ["background-workers", "caching-redis"],
    minRing: "theory",
    prereqNodes: ["eng-api-security", "eng-database"],
    age: 3,
  },
  {
    id: "eng-distributed",
    civilization: "engineering",
    title: "Distributed Behaviour",
    unlocks: "Components that react to events instead of calling each other directly.",
    topicIds: ["event-driven-outbox", "rate-limiting"],
    minRing: "theory",
    prereqNodes: ["eng-async-work"],
    age: 4,
  },
  {
    id: "eng-production",
    civilization: "engineering",
    title: "Production Engineering",
    unlocks: "Running it for real: deploys, cloud, on-call, observability.",
    topicIds: [],
    minRing: "theory",
    prereqNodes: ["eng-distributed"],
    age: 5,
    contentGap: true,
  },
];

export const AI_TREE: CivilizationNode[] = [
  {
    id: "ai-provider-layer",
    civilization: "ai",
    title: "Speaking To Models",
    unlocks: "Swapping model providers without rewriting the application.",
    topicIds: ["provider-abstraction", "cost-tracking"],
    minRing: "production",
    prereqNodes: [],
    age: 1,
  },
  {
    id: "ai-tool-use",
    civilization: "ai",
    title: "Tool Use",
    unlocks: "A model that can act on the system, not just describe it.",
    topicIds: ["tool-calling", "structured-outputs"],
    minRing: "implement",
    prereqNodes: ["ai-provider-layer"],
    age: 2,
  },
  {
    id: "ai-retrieval",
    civilization: "ai",
    title: "Meaning As Coordinates",
    unlocks: "Finding things by what they mean rather than how they are spelled.",
    topicIds: ["embeddings", "vector-search"],
    minRing: "theory",
    prereqNodes: ["ai-provider-layer"],
    age: 2,
  },
  {
    id: "ai-rag",
    civilization: "ai",
    title: "Grounded Answers",
    unlocks: "Answers backed by your own data instead of the model's memory.",
    topicIds: ["rag"],
    minRing: "theory",
    prereqNodes: ["ai-retrieval"],
    age: 3,
  },
  {
    id: "ai-memory",
    civilization: "ai",
    title: "Continuity",
    unlocks: "Conversations that survive the end of a request.",
    topicIds: ["conversation-memory"],
    minRing: "theory",
    prereqNodes: ["ai-tool-use"],
    age: 3,
  },
  {
    id: "ai-orchestration",
    civilization: "ai",
    title: "Many Agents, One Goal",
    unlocks: "Splitting a problem across specialised agents and merging the result.",
    topicIds: ["agents-orchestration"],
    minRing: "theory",
    prereqNodes: ["ai-tool-use", "ai-memory"],
    age: 4,
  },
  {
    id: "ai-quality",
    civilization: "ai",
    title: "Knowing If It Works",
    unlocks: "Treating prompts as versioned artefacts with measurable quality.",
    topicIds: ["llm-evals", "ai-observability", "prompt-versioning"],
    minRing: "theory",
    prereqNodes: ["ai-orchestration"],
    age: 4,
  },
  {
    id: "ai-interop",
    civilization: "ai",
    title: "Interoperability",
    unlocks: "Other systems consuming your intelligence through a standard protocol.",
    topicIds: ["mcp"],
    minRing: "theory",
    prereqNodes: ["ai-quality"],
    age: 5,
  },
];

export const RETAIL_TREE: CivilizationNode[] = [
  {
    id: "retail-product-knowledge",
    civilization: "retail-intel",
    title: "Product Knowledge",
    unlocks: "Knowing what a product IS — one identity per physical thing on the shelf.",
    topicIds: ["three-layer-architecture", "entity-resolution"],
    minRing: "production",
    prereqNodes: [],
    age: 1,
  },
  {
    id: "retail-customer-understanding",
    civilization: "retail-intel",
    title: "Customer Understanding",
    unlocks: "Turning anonymous bills into recognisable, returning people.",
    topicIds: ["sql-window-functions"],
    minRing: "production",
    prereqNodes: [],
    age: 1,
  },
  {
    id: "retail-analytics",
    civilization: "retail-intel",
    title: "Analytics",
    unlocks: "Answering 'what happened' reliably and fast enough to act on.",
    topicIds: ["idempotent-rebuilds", "postgres-optimization"],
    minRing: "production",
    prereqNodes: ["retail-product-knowledge", "retail-customer-understanding"],
    age: 2,
  },
  {
    id: "retail-forecasting",
    civilization: "retail-intel",
    title: "Forecasting",
    unlocks: "Moving from 'what happened' to 'what is about to happen'.",
    topicIds: ["demand-forecasting", "mlflow-tracking"],
    minRing: "implement",
    prereqNodes: ["retail-analytics"],
    age: 3,
  },
  {
    id: "retail-recommendations",
    civilization: "retail-intel",
    title: "Recommendations",
    unlocks: "Knowing what sells with what — bundles, placement, clearance pairing.",
    topicIds: ["basket-analysis"],
    minRing: "production",
    prereqNodes: ["retail-analytics"],
    age: 3,
  },
  {
    id: "retail-planning",
    civilization: "retail-intel",
    title: "Planning",
    unlocks: "Turning predictions into concrete orders, quantities and timing.",
    topicIds: [],
    minRing: "theory",
    prereqNodes: ["retail-forecasting", "retail-recommendations"],
    age: 4,
    contentGap: true,
  },
  {
    id: "retail-decision-intelligence",
    civilization: "retail-intel",
    title: "Decision Intelligence",
    unlocks: "Ranking, optimisation and evaluation — deciding, not just predicting.",
    // Deliberately empty: no authored topic covers ranking or optimisation yet.
    // Citing llm-evals here would have made the rung look covered when it is not.
    topicIds: [],
    minRing: "theory",
    prereqNodes: ["retail-planning"],
    age: 4,
    contentGap: true,
  },
  {
    id: "retail-copilot",
    civilization: "retail-intel",
    title: "Retail Copilot",
    unlocks: "Asking the shop a question in plain language and getting a real number back.",
    topicIds: ["rag", "tool-calling"],
    minRing: "implement",
    prereqNodes: ["retail-decision-intelligence"],
    age: 5,
  },
  {
    id: "retail-os",
    civilization: "retail-intel",
    title: "Retail Operating System",
    unlocks: "The shop runs on its own intelligence, with humans approving the calls.",
    topicIds: ["agents-orchestration", "mcp"],
    minRing: "theory",
    prereqNodes: ["retail-copilot"],
    age: 6,
  },
];

export const CS_TREE: CivilizationNode[] = [
  {
    id: "cs-memory-model",
    civilization: "cs",
    title: "Memory & Lookup",
    unlocks: "Knowing why one data structure is fast and another is not.",
    topicIds: ["arrays-memory", "hash-tables"],
    minRing: "theory",
    prereqNodes: [],
    age: 1,
  },
  {
    id: "cs-structures",
    civilization: "cs",
    title: "Trees & Graphs",
    unlocks: "Reading a database index and a dependency graph as the same idea.",
    topicIds: ["trees-indexes", "graphs-dags"],
    minRing: "theory",
    prereqNodes: ["cs-memory-model"],
    age: 2,
  },
  {
    id: "cs-algorithms",
    civilization: "cs",
    title: "Algorithmic Thinking",
    unlocks: "Recognising when a problem has structure worth exploiting.",
    topicIds: ["dynamic-programming", "greedy-algorithms"],
    minRing: "theory",
    prereqNodes: ["cs-structures"],
    age: 3,
  },
  {
    id: "cs-machine",
    civilization: "cs",
    title: "The Machine Underneath",
    unlocks: "Understanding what the process, the kernel and the network actually do.",
    topicIds: ["concurrency", "operating-systems", "networking"],
    minRing: "theory",
    prereqNodes: ["cs-structures"],
    age: 4,
  },
  {
    id: "cs-languages",
    civilization: "cs",
    title: "Languages & Translation",
    unlocks: "Seeing every DSL, query planner and parser as the same machinery.",
    topicIds: ["compilers"],
    minRing: "theory",
    prereqNodes: ["cs-machine"],
    age: 5,
  },
];

export const SYSTEM_DESIGN_TREE: CivilizationNode[] = [
  {
    id: "sys-single-node-limits",
    civilization: "system-design",
    title: "Limits Of One Machine",
    unlocks: "Knowing exactly where a single Postgres box stops being enough.",
    topicIds: ["postgres-optimization", "db-scaling"],
    minRing: "theory",
    prereqNodes: [],
    age: 1,
  },
  {
    id: "sys-relieving-pressure",
    civilization: "system-design",
    title: "Relieving Pressure",
    unlocks: "Caching and queues: doing less work, and doing it later.",
    topicIds: ["caching-redis", "background-workers"],
    minRing: "theory",
    prereqNodes: ["sys-single-node-limits"],
    age: 2,
  },
  {
    id: "sys-horizontal",
    civilization: "system-design",
    title: "Going Horizontal",
    unlocks: "More machines — and the coordination problems they create.",
    topicIds: ["load-balancing", "rate-limiting"],
    minRing: "theory",
    prereqNodes: ["sys-relieving-pressure"],
    age: 3,
  },
  {
    id: "sys-truth-at-distance",
    civilization: "system-design",
    title: "Truth At A Distance",
    unlocks: "What 'correct' even means once data lives in more than one place.",
    topicIds: ["consistency-models", "cap-theorem"],
    minRing: "theory",
    prereqNodes: ["sys-horizontal"],
    age: 4,
  },
  {
    id: "sys-decomposition",
    civilization: "system-design",
    title: "Decomposition & Events",
    unlocks: "Splitting a system on purpose instead of by accident.",
    topicIds: ["microservices-tradeoff", "event-driven-outbox"],
    minRing: "theory",
    prereqNodes: ["sys-truth-at-distance"],
    age: 5,
  },
  {
    id: "sys-operability",
    civilization: "system-design",
    title: "Operability",
    unlocks: "Being able to answer 'what is it doing right now?' in production.",
    topicIds: ["systems-observability", "distributed-architecture"],
    minRing: "theory",
    prereqNodes: ["sys-decomposition"],
    age: 6,
  },
];

export const CIVILIZATION_NODES: CivilizationNode[] = [
  ...ENGINEERING_TREE,
  ...AI_TREE,
  ...RETAIL_TREE,
  ...CS_TREE,
  ...SYSTEM_DESIGN_TREE,
];

export const CIVILIZATION_ORDER: CivilizationId[] = [
  "retail-intel",
  "ai",
  "engineering",
  "system-design",
  "cs",
];

export const NODE_BY_ID: Record<string, CivilizationNode> = Object.fromEntries(
  CIVILIZATION_NODES.map((n) => [n.id, n]),
);

export function nodesOf(civ: CivilizationId): CivilizationNode[] {
  return CIVILIZATION_NODES.filter((n) => n.civilization === civ).sort(
    (a, b) => a.age - b.age,
  );
}

type RingsOf = (topicId: string) => RingProgress;

/**
 * A node is reached when every topic it references has its `minRing` flag set.
 * A node with no topics (a declared content gap) can never be reached — that is
 * deliberate: it should read as "known to be missing", not as free progress.
 */
export function isNodeReached(node: CivilizationNode, ringsOf: RingsOf): boolean {
  if (node.topicIds.length === 0) return false;
  return node.topicIds.every(
    (id) => !TOPIC_BY_ID[id] || ringSet(ringsOf(id), node.minRing),
  );
}

/** Unlocked = every prerequisite node reached. Unlocked-but-not-reached is "available now". */
export function isNodeUnlocked(node: CivilizationNode, ringsOf: RingsOf): boolean {
  return node.prereqNodes.every((p) => {
    const prereq = NODE_BY_ID[p];
    return !prereq || isNodeReached(prereq, ringsOf);
  });
}

export interface CivilizationState {
  civilization: CivilizationId;
  /** Highest age whose nodes are all reached. 0 = nothing complete yet. */
  currentAge: number;
  totalAges: number;
  reached: CivilizationNode[];
  /** Unlocked, not yet reached — the honest "you could do this now" set. */
  available: CivilizationNode[];
  locked: CivilizationNode[];
}

export function civilizationState(
  civ: CivilizationId,
  ringsOf: RingsOf,
): CivilizationState {
  const nodes = nodesOf(civ);
  const reached: CivilizationNode[] = [];
  const available: CivilizationNode[] = [];
  const locked: CivilizationNode[] = [];

  for (const node of nodes) {
    if (isNodeReached(node, ringsOf)) reached.push(node);
    else if (isNodeUnlocked(node, ringsOf)) available.push(node);
    else locked.push(node);
  }

  const ages = [...new Set(nodes.map((n) => n.age))].sort((a, b) => a - b);
  let currentAge = 0;
  for (const age of ages) {
    const inAge = nodes.filter((n) => n.age === age);
    if (inAge.every((n) => isNodeReached(n, ringsOf))) currentAge = age;
    else break;
  }

  return {
    civilization: civ,
    currentAge,
    totalAges: ages.length,
    reached,
    available,
    locked,
  };
}

/**
 * "What is the next meaningful milestone?" — the available node with the fewest
 * unmet topics, so the suggestion is the one actually closest to falling.
 */
export function recommendNextNode(ringsOf: RingsOf): CivilizationNode | undefined {
  const candidates = CIVILIZATION_NODES.filter(
    (n) => n.topicIds.length > 0 && !isNodeReached(n, ringsOf) && isNodeUnlocked(n, ringsOf),
  );
  if (candidates.length === 0) return undefined;

  const unmet = (n: CivilizationNode) =>
    n.topicIds.filter((id) => !ringSet(ringsOf(id), n.minRing)).length;

  return candidates.sort((a, b) => unmet(a) - unmet(b) || a.age - b.age)[0];
}

/** Which civilization node(s) a topic contributes to — used for "why am I learning this?". */
export function nodesForTopic(topicId: string): CivilizationNode[] {
  return CIVILIZATION_NODES.filter((n) => n.topicIds.includes(topicId));
}
