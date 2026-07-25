"use client";

// Learning Path — the prerequisite DAG as ordered layers, adapted to
// your confidence. Answers one question: what should I learn next?

import Link from "next/link";
import { useMemo } from "react";
import { recommendNext, topologicalLayers } from "@/lib/academy/topics";
import { DOMAIN_META } from "@/lib/academy/types";
import { useProgress } from "@/lib/academy/progress";
import { Card, ConfidenceDot, DifficultyBadge, Eyebrow, StatusBadge } from "@/components/academy/ui";
import { ArrowDown } from "lucide-react";

export default function PathPage() {
  const { confidenceOf, hydrated } = useProgress();
  const layers = useMemo(() => topologicalLayers(), []);
  const next = useMemo(() => recommendNext(confidenceOf, 3), [confidenceOf]);
  const nextIds = new Set(next.map((t) => t.id));

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>Learning path</Eyebrow>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          The curriculum as a dependency graph, not a checklist. Each row unlocks the
          next; blue outlines mark your current frontier — everything they depend on
          is already colored in.
        </p>
      </div>

      {hydrated && next.length > 0 && (
        <Card className="border-[#105dff]/30 bg-blue-50/40 p-4">
          <Eyebrow>Right now, learn</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2">
            {next.map((t, i) => (
              <Link
                key={t.id}
                href={`/academy/topics/${t.id}`}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  i === 0
                    ? "border-[#105dff] bg-[#105dff] text-white"
                    : "border-blue-200 bg-white text-[#105dff] hover:bg-blue-50"
                }`}
              >
                {i === 0 ? "▶ " : ""}{t.title}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div>
        {layers.map((layer, li) => (
          <div key={li}>
            {li > 0 && (
              <div className="flex items-center gap-2 py-2 pl-2">
                <ArrowDown className="h-4 w-4 text-gray-300" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                  unlocks
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {layer.map((t) => {
                const c = confidenceOf(t.id);
                const isNext = nextIds.has(t.id);
                return (
                  <Link
                    key={t.id}
                    href={`/academy/topics/${t.id}`}
                    className={`group flex min-w-[220px] flex-1 items-center gap-2.5 rounded-xl border bg-white p-3 transition-all hover:shadow-md sm:flex-none ${
                      isNext ? "border-[#105dff] ring-2 ring-blue-100" : "border-gray-200 hover:border-blue-200"
                    }`}
                  >
                    <ConfidenceDot level={c} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[#1b293e] group-hover:text-[#105dff]">
                        {t.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className="font-mono text-[10px] uppercase tracking-wider"
                          style={{ color: DOMAIN_META[t.domain].color }}
                        >
                          {t.domain}
                        </span>
                        <DifficultyBadge level={t.difficulty} />
                        <StatusBadge status={t.status} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
