"use client";

import { useState } from "react";
import { CivilizationTree } from "@/components/academy/CivilizationTree";
import { CivBadge } from "@/components/academy/v2";
import { useProgress } from "@/lib/academy/progress";
import { CIVILIZATION_META } from "@/lib/academy/types";
import type { CivilizationId } from "@/lib/academy/types";
import {
  CIVILIZATION_ORDER,
  civilizationState,
  nodesOf,
  recommendNextNode,
} from "@/lib/academy/civilization";

export default function CivilizationPage() {
  const { ringsOf, hydrated } = useProgress();
  const [active, setActive] = useState<CivilizationId>("retail-intel");

  const nextNode = hydrated ? recommendNextNode(ringsOf) : undefined;

  return (
    <div className="px-4 py-6">

      <div className="mb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          Civilization Map
        </div>
        <h2 className="text-xl font-bold text-[#1b293e]">Where am I going?</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Five trees that progress independently. A milestone is not a technology — it is a
          capability you have earned. Nothing here is unlocked by reading; it unlocks when the
          topics underneath it reach the ring the milestone asks for.
        </p>
      </div>

      {nextNode ? (
        <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-orange-700">
            Closest milestone
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-base font-semibold text-[#1b293e]">{nextNode.title}</span>
            <CivBadge civ={nextNode.civilization} size="xs" />
          </div>
          <p className="mt-1 text-sm text-gray-600">{nextNode.unlocks}</p>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {CIVILIZATION_ORDER.map((c) => {
          const meta = CIVILIZATION_META[c];
          const count = nodesOf(c).length;
          const st = hydrated ? civilizationState(c, ringsOf) : null;
          const on = active === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setActive(c)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                on ? "text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
              style={on ? { backgroundColor: meta.color, borderColor: meta.color } : undefined}
            >
              <span className="block text-sm font-medium">{meta.label}</span>
              <span className={`block font-mono text-[11px] ${on ? "opacity-80" : "text-gray-400"}`}>
                {count === 0
                  ? "not written yet"
                  : `${st?.reached.length ?? 0}/${count} milestones`}
              </span>
            </button>
          );
        })}
      </div>

      <CivilizationTree civ={active} ringsOf={ringsOf} />
    </div>
  );
}
