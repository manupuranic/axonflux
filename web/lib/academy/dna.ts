import type { DNAPrinciple } from "./types";

/**
 * PROJECT DNA — the principles that outlive any technology choice here.
 *
 * The bar for this list: would I still endorse this in five years, no matter
 * what stack AxonFlux is running on? If a rule needs an "except when" clause,
 * it is a decision, not DNA — it belongs in decisions.ts instead.
 *
 * Every principle carries a `cost`. A principle with no cost is a slogan: it
 * has never been tested against a case where following it hurt. Naming the
 * cost is what makes it a real commitment rather than a nice sentence.
 *
 * This file should change very rarely, and never as a side effect of shipping
 * a feature.
 */
export const DNA_PRINCIPLES: DNAPrinciple[] = [
  {
    id: "raw-immutable",
    statement: "Raw data is immutable. Never UPDATE, never DELETE.",
    rationale:
      "The billing system is a black box with no API. The only trustworthy record of what happened in the store is the exact bytes that were exported. If we edit that record — even to 'fix' it — we lose the ability to ever prove what was actually true, and every downstream number becomes an opinion instead of a fact.",
    cost:
      "We carry duplicates, malformed dates, and messy supplier names forever, and pay to clean them on every read instead of once on write. Storage grows monotonically. Fixing a bad export means adding a correction, never erasing the mistake.",
    examples: ["raw", "ingestion", "adr-001-schema-separation", "data-foundation"],
  },
  {
    id: "derived-disposable",
    statement: "Derived data is disposable. Anything rebuildable must be rebuildable.",
    rationale:
      "If every analytical table can be dropped and recreated from raw, then a bug in analytics is a five-minute SQL fix rather than a data-recovery incident. This is what makes it safe to iterate aggressively on the hard, interesting part of the system.",
    cost:
      "Nothing human-authored may ever live in derived.* — so the moment a feature needs to remember something a person decided, it needs a new app.* table and a migration. That friction is the price, and it is worth paying.",
    examples: ["derived", "pipeline", "adr-001-schema-separation", "adr-003-entity-resolution"],
  },
  {
    id: "humans-approve",
    statement: "Agents suggest. Humans approve. No autonomous writes.",
    rationale:
      "This is a real shop with real inventory and real money. An agent that silently places a wrong purchase order or discounts the wrong product does damage that no apology undoes. Every agent output is a proposal until a person accepts it.",
    cost:
      "Every agent needs an approval surface built before it is useful, which roughly doubles the work of shipping one. It also caps how much leverage automation can ever give — by design.",
    examples: ["cash-integrity", "product-identity", "purchase-planner", "multi-agent-coordinator"],
  },
  {
    id: "knowledge-before-automation",
    statement: "Understand it before you delegate it.",
    rationale:
      "Automating a process you do not understand does not remove the work — it hides it, and hands you a system you cannot debug when it drifts. The Academy exists because of this principle: understanding is treated as a deliverable, not a side effect.",
    cost:
      "Slower. Some features wait behind learning that a copy-paste implementation would have skipped. Accepted deliberately: the goal is a system its owner can still reason about in five years.",
    examples: ["forecast-agent", "information-agent", "adr-005-bom-design"],
  },
  {
    id: "capabilities-not-features",
    statement: "Build capabilities, not features.",
    rationale:
      "A feature is a screen. A capability is something the business can now do that it could not do before. Framing work as capability forces the question 'what does this unlock?' — which is the only question that reliably produces a system instead of a pile of pages.",
    cost:
      "Slower to start: a capability usually needs shared scaffolding (audit, approval, orchestration) that a one-off feature would skip. The payoff only arrives from the second capability onward.",
    examples: ["information-agent", "multi-agent-coordinator", "adr-002-plugin-tools"],
  },
  {
    id: "no-pii-crosses-boundary",
    statement: "Customer identity never crosses a public boundary.",
    rationale:
      "Mobile numbers are the customer key across the whole analytics layer, which makes them the easiest thing in the system to leak by accident. So the boundary is drawn once, hard: the public storefront gets zero customer data, and the MCP server returns counts, never people.",
    cost:
      "Some genuinely useful external integrations become impossible rather than merely careful — no per-customer personalisation on any public surface, ever, even when the customer would want it.",
    examples: ["storage", "storefront-agent", "retail-copilot"],
  },
];

export const DNA_BY_ID: Record<string, DNAPrinciple> = Object.fromEntries(
  DNA_PRINCIPLES.map((p) => [p.id, p]),
);

export function principleTitle(id: string): string {
  return DNA_BY_ID[id]?.statement ?? id;
}
