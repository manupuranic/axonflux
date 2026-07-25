"use client";

// Future Roadmap — phases ranked by learning/interview/production value,
// plus the deliberately rejected tech (interview ammunition).

import { useState } from "react";
import { REJECTED_TECH, ROADMAP } from "@/lib/academy/roadmap";
import { Card, DifficultyBadge, Eyebrow } from "@/components/academy/ui";
import { XCircle } from "lucide-react";

type SortKey = "phase" | "learningValue" | "interviewValue" | "productionValue" | "complexity";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "phase", label: "Build order" },
  { key: "learningValue", label: "Learning value" },
  { key: "interviewValue", label: "Interview value" },
  { key: "productionValue", label: "Production value" },
  { key: "complexity", label: "Complexity" },
];

function Rating({ value, color = "#105dff" }: { value: number; color?: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-1.5 w-3.5 rounded-sm"
          style={{ backgroundColor: i <= value ? color : "#e5e7eb" }}
        />
      ))}
    </div>
  );
}

export default function RoadmapPage() {
  const [sort, setSort] = useState<SortKey>("phase");
  const sorted = [...ROADMAP].sort((a, b) =>
    sort === "phase" ? a.phase - b.phase : b[sort] - a[sort],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Future roadmap</Eyebrow>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Six phases, honest fits only. Phases 1–3 are the MVP arc; 4–6 are the
            differentiation arc. Sort by what you're optimizing for.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                sort === s.key
                  ? "bg-[#1b293e] text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {sorted.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[#1b293e] px-2 py-0.5 font-mono text-xs font-bold text-white">
                    P{p.phase}
                  </span>
                  <h2 className="text-lg font-bold text-[#1b293e]">{p.title}</h2>
                  {p.mvp && (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      MVP arc
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-2xl text-sm text-gray-600">{p.goal}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-500">
                <div className="flex items-center justify-between gap-2">Learning <Rating value={p.learningValue} /></div>
                <div className="flex items-center justify-between gap-2">Interview <Rating value={p.interviewValue} color="#7c3aed" /></div>
                <div className="flex items-center justify-between gap-2">Production <Rating value={p.productionValue} color="#059669" /></div>
                <div className="flex items-center justify-between gap-2">Complexity <Rating value={p.complexity} color="#d97706" /></div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <Eyebrow>Features</Eyebrow>
                <ul className="mt-1.5 space-y-1.5">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                      <span>{f.name}</span>
                      <DifficultyBadge level={f.difficulty} />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <div>
                  <Eyebrow>New concepts learned</Eyebrow>
                  <p className="mt-1 text-sm text-gray-700">{p.concepts.join(" · ")}</p>
                </div>
                <div>
                  <Eyebrow>Who uses this in industry</Eyebrow>
                  <p className="mt-1 text-sm text-gray-700">{p.companies}</p>
                </div>
                <div>
                  <Eyebrow>Dependencies</Eyebrow>
                  <p className="mt-1 text-sm text-gray-700">{p.dependencies}</p>
                </div>
                <div>
                  <Eyebrow>Resume line it earns</Eyebrow>
                  <p className="mt-1 text-sm italic text-gray-700">“{p.resume}”</p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="border-rose-100 p-5">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-rose-500" />
          <Eyebrow>Deliberately rejected — and why that's interview gold</Eyebrow>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {REJECTED_TECH.map((r) => (
            <div key={r.name} className="rounded-lg bg-rose-50/50 p-3">
              <div className="text-sm font-semibold text-rose-800">{r.name}</div>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">{r.reason}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
