"use client";

// Interview Mode — every question generated from YOUR project.
// Reveal tracking feeds the readiness score.

import { useMemo, useState } from "react";
import { buildDeck } from "@/lib/academy/interview";
import { useProgress } from "@/lib/academy/progress";
import { RevealCard } from "@/components/academy/RevealCard";
import { Card, Eyebrow, ProgressBar } from "@/components/academy/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "system", label: "System-wide" },
  { key: "data", label: "Data" },
  { key: "backend", label: "Backend" },
  { key: "ml", label: "ML" },
  { key: "ai", label: "AI" },
  { key: "feature", label: "Features" },
] as const;

export default function InterviewPage() {
  const deck = useMemo(() => buildDeck(), []);
  const { state, toggleRevealed, hydrated } = useProgress();
  const [filter, setFilter] = useState<string>("all");

  const filtered = deck.filter((q) => filter === "all" || q.domainHint === filter);
  const explored = deck.filter((q) => state.revealed.includes(q.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Interview mode</Eyebrow>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {deck.length} questions an interviewer could ask about AxonFlux — every one
            answerable from work you actually did. Read the ideal answer, close the card,
            then say it in your own words out loud.
          </p>
        </div>
        <Card className="w-56 p-3">
          <Eyebrow>Readiness</Eyebrow>
          <div className="mt-1 text-xl font-bold text-[#1b293e]">
            {hydrated ? `${explored}/${deck.length}` : "—"}
          </div>
          <div className="mt-1.5">
            <ProgressBar value={hydrated ? explored / deck.length : 0} color="#059669" />
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-[#1b293e] text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((q) => (
          <RevealCard
            key={q.id}
            question={q.q}
            answer={q.a}
            source={q.source}
            revealed={state.revealed.includes(q.id)}
            onToggle={() => toggleRevealed(q.id)}
          />
        ))}
      </div>
    </div>
  );
}
