import type { Confidence, Topic } from "./types";
import { DATA_BACKEND_TOPICS } from "./topics-data-backend";
import { ML_AI_TOPICS } from "./topics-ml-ai";
import { CS_TOPICS } from "./topics-cs";
import { SYSTEMS_TOPICS } from "./topics-systems";

// Ordered fundamentals → application, matching the synapse map's column bands.
export const TOPICS: Topic[] = [
  ...CS_TOPICS,
  ...DATA_BACKEND_TOPICS,
  ...SYSTEMS_TOPICS,
  ...ML_AI_TOPICS,
];

export const TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t]),
);

export function topicTitle(id: string): string {
  return TOPIC_BY_ID[id]?.title ?? id;
}

/** Prerequisite edges (from → to means "from unlocks to"). */
export const EDGES: { from: string; to: string }[] = TOPICS.flatMap((t) =>
  t.prereqs
    .filter((p) => TOPIC_BY_ID[p])
    .map((p) => ({ from: p, to: t.id })),
);

/**
 * Topological layers of the prerequisite DAG — the learning path.
 * Layer 0 = no prerequisites; each next layer depends only on earlier ones.
 */
export function topologicalLayers(): Topic[][] {
  const placed = new Set<string>();
  const layers: Topic[][] = [];
  let remaining = TOPICS.slice();
  // Bounded iterations guard against accidental cycles in authored data.
  for (let i = 0; i < 20 && remaining.length > 0; i++) {
    const layer = remaining.filter((t) =>
      t.prereqs.every((p) => !TOPIC_BY_ID[p] || placed.has(p)),
    );
    if (layer.length === 0) break; // cycle — surface whatever's left as-is
    layers.push(layer);
    layer.forEach((t) => placed.add(t.id));
    remaining = remaining.filter((t) => !placed.has(t.id));
  }
  if (remaining.length > 0) layers.push(remaining);
  return layers;
}

/**
 * "What should I learn next?" — topics whose prerequisites are all at least
 * partial, that aren't solid yet. Ready content first, then easier first.
 */
export function recommendNext(
  confidenceOf: (id: string) => Confidence,
  limit = 5,
): Topic[] {
  const rank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
  return TOPICS.filter((t) => {
    if (confidenceOf(t.id) === "solid") return false;
    return t.prereqs.every(
      (p) => !TOPIC_BY_ID[p] || confidenceOf(p) !== "none",
    );
  })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "ready" ? -1 : 1;
      // In-progress (partial) topics before untouched ones — finish what you started.
      const ca = confidenceOf(a.id) === "partial" ? 0 : 1;
      const cb = confidenceOf(b.id) === "partial" ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return rank[a.difficulty] - rank[b.difficulty];
    })
    .slice(0, limit);
}

/** Breadcrumb chain for "You are here": follows the first prerequisite upward. */
export function ancestryOf(id: string): Topic[] {
  const chain: Topic[] = [];
  let cur = TOPIC_BY_ID[id];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    const parent = cur.prereqs.find((p) => TOPIC_BY_ID[p]);
    cur = parent ? TOPIC_BY_ID[parent] : (undefined as unknown as Topic);
  }
  return chain;
}
