"use client";

import { useState } from "react";
import Link from "next/link";
import { CapabilityStatusBadge, CivBadge, Milestone } from "@/components/academy/v2";
import { CAPABILITIES } from "@/lib/academy/capabilities";
import { useProgress } from "@/lib/academy/progress";
import type { CapabilityStatus } from "@/lib/academy/types";

const GROUPS: { status: CapabilityStatus; blurb: string }[] = [
  { status: "built", blurb: "Already earned. These run in production today." },
  { status: "next", blurb: "The current mission." },
  { status: "in-progress", blurb: "Started, not finished." },
  { status: "planned", blurb: "Sequenced, unblocked, not started." },
  { status: "blocked", blurb: "Something concrete is in the way — named, not vague." },
];

export default function CapabilitiesPage() {
  const { ringsOf, hydrated } = useProgress();
  const [filter, setFilter] = useState<CapabilityStatus | "all">("all");

  const built = CAPABILITIES.filter((c) => c.status === "built").length;

  const readiness = (ids: string[]) => {
    if (!hydrated || ids.length === 0) return { done: 0, total: ids.length };
    return { done: ids.filter((t) => ringsOf(t).theory).length, total: ids.length };
  };

  return (
    <div className="px-4 py-6">

      <div className="mb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          Capabilities
        </div>
        <h2 className="text-xl font-bold text-[#1b293e]">What can I now do?</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Not features, not technologies. Each one is something the business can do that it could
          not do before — and each one names what it unlocks next.
        </p>
        <div className="mt-3">
          <Milestone done={built} total={CAPABILITIES.length} noun="capabilities built" />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {(["all", ...GROUPS.map((g) => g.status)] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === s ? "bg-[#1b293e] text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {s === "all" ? "All" : s.replace("-", " ")}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {GROUPS.filter((g) => filter === "all" || filter === g.status).map((group) => {
          const items = CAPABILITIES.filter((c) => c.status === group.status);
          if (items.length === 0) return null;
          return (
            <section key={group.status}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
                <CapabilityStatusBadge status={group.status} />
                <span className="text-sm text-gray-500">{group.blurb}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((c) => {
                  const r = readiness(c.requiredTopicIds);
                  return (
                    <Link
                      key={c.id}
                      href={`/academy/capabilities/${c.id}`}
                      className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-[#1b293e] group-hover:text-[#105dff]">
                          {c.title}
                        </h3>
                        <div className="flex shrink-0 gap-1">
                          {c.civilizations.map((civ) => (
                            <CivBadge key={civ} civ={civ} size="xs" />
                          ))}
                        </div>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{c.mission}</p>
                      {c.blockedBy ? (
                        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                          {c.blockedBy}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-gray-400">
                        <span>
                          {r.done}/{r.total} concepts started
                        </span>
                        {c.unlocksCapabilities.length > 0 ? (
                          <span>unlocks {c.unlocksCapabilities.length}</span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
