"use client";

// The Civilization Map: one tree, rendered as ages (rows) of milestones.
//
// Layout is deliberately age-banded rather than force-directed. A tech tree's
// job is to answer "what comes next?" at a glance, and rows of ages do that
// better than an organic graph — you read it top to bottom like a timeline.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CivilizationId, CivilizationNode, RingProgress } from "@/lib/academy/types";
import { CIVILIZATION_META, RING_META } from "@/lib/academy/types";
import { TOPIC_BY_ID } from "@/lib/academy/topics";
import { civilizationState, isNodeReached, isNodeUnlocked, nodesOf } from "@/lib/academy/civilization";
import { CAPABILITIES } from "@/lib/academy/capabilities";
import { CapabilityChip, Milestone } from "./v2";

type NodeState = "reached" | "available" | "locked" | "gap";

function stateOf(
  node: CivilizationNode,
  ringsOf: (id: string) => RingProgress,
): NodeState {
  if (node.contentGap) return "gap";
  if (isNodeReached(node, ringsOf)) return "reached";
  if (isNodeUnlocked(node, ringsOf)) return "available";
  return "locked";
}

export function CivilizationTree({
  civ,
  ringsOf,
}: {
  civ: CivilizationId;
  ringsOf: (id: string) => RingProgress;
}) {
  const meta = CIVILIZATION_META[civ];
  const nodes = useMemo(() => nodesOf(civ), [civ]);
  const state = useMemo(() => civilizationState(civ, ringsOf), [civ, ringsOf]);
  const [selected, setSelected] = useState<string | null>(null);

  const ages = useMemo(() => [...new Set(nodes.map((n) => n.age))].sort((a, b) => a - b), [nodes]);
  const node = selected ? nodes.find((n) => n.id === selected) : undefined;

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
        No milestones authored for {meta.label} yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </h3>
          <p className="text-sm text-gray-500">{meta.tagline}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs uppercase tracking-wider text-gray-400">
            {state.currentAge > 0 ? `Age ${state.currentAge} complete` : "Age I in progress"}
          </div>
          <Milestone done={state.reached.length} total={nodes.length} noun="milestones" />
        </div>
      </div>

      <div className="space-y-3">
        {ages.map((age) => (
          <div key={age} className="flex gap-3">
            <div className="flex w-12 shrink-0 flex-col items-center pt-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-gray-400">
                Age
              </span>
              <span className="font-mono text-sm font-semibold text-gray-500">{age}</span>
              {age !== ages[ages.length - 1] ? (
                <span className="mt-1 flex-1 border-l border-dashed border-gray-200" />
              ) : null}
            </div>

            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {nodes
                .filter((n) => n.age === age)
                .map((n) => {
                  const s = stateOf(n, ringsOf);
                  const active = selected === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelected(active ? null : n.id)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        active ? "ring-2 ring-offset-1" : ""
                      } ${
                        s === "reached"
                          ? "border-transparent bg-amber-50"
                          : s === "available"
                            ? "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                            : s === "gap"
                              ? "border-dashed border-gray-300 bg-gray-50"
                              : "border-gray-200 bg-gray-50 opacity-60 hover:opacity-90"
                      }`}
                      style={
                        s === "reached"
                          ? { boxShadow: `inset 0 0 0 1px ${meta.color}55` }
                          : undefined
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            s === "locked" || s === "gap" ? "text-gray-500" : "text-[#1b293e]"
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 text-xs">
                          {s === "reached" ? "★" : s === "locked" ? "🔒" : s === "gap" ? "—" : "○"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">{n.unlocks}</p>
                      {s === "gap" ? (
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-gray-400">
                          Not written yet
                        </p>
                      ) : (
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-gray-400">
                          {n.topicIds.filter((t) => ringsOf(t)[n.minRing]).length}/
                          {n.topicIds.length} at {RING_META[n.minRing].label.toLowerCase()}
                        </p>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {node ? <NodePanel node={node} ringsOf={ringsOf} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function NodePanel({
  node,
  ringsOf,
  onClose,
}: {
  node: CivilizationNode;
  ringsOf: (id: string) => RingProgress;
  onClose: () => void;
}) {
  const meta = CIVILIZATION_META[node.civilization];
  const caps = CAPABILITIES.filter((c) =>
    c.requiredTopicIds.some((t) => node.topicIds.includes(t)),
  );

  return (
    <div className="mt-4 rounded-xl border bg-white p-4" style={{ borderColor: `${meta.color}44` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
            Age {node.age} milestone
          </div>
          <h4 className="text-base font-semibold text-[#1b293e]">{node.title}</h4>
          <p className="mt-1 text-sm text-gray-600">{node.unlocks}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {node.contentGap ? (
        <p className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
          No topic has been written for this rung yet. It is listed so the gap is visible rather
          than hidden — an empty milestone is more honest than a padded one.
        </p>
      ) : (
        <div className="mt-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
            Made of — needs {RING_META[node.minRing].label.toLowerCase()}
          </div>
          <ul className="mt-2 space-y-1.5">
            {node.topicIds.map((id) => {
              const t = TOPIC_BY_ID[id];
              const has = ringsOf(id)[node.minRing];
              return (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${has ? "bg-emerald-500" : "bg-gray-300"}`}
                  />
                  <Link
                    href={`/academy/topics/${id}`}
                    className="text-gray-700 underline-offset-2 hover:text-blue-700 hover:underline"
                  >
                    {t?.title ?? id}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {caps.length > 0 ? (
        <div className="mt-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
            Powers these capabilities
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {caps.map((c) => (
              <CapabilityChip key={c.id} id={c.id} title={c.title} status={c.status} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
