"use client";

// Clickable system map: SVG blocks + a detail panel that explains
// purpose, design rationale, alternatives, trade-offs, and files.

import { useState } from "react";
import type { ArchNode } from "@/lib/academy/types";
import { DOMAIN_META } from "@/lib/academy/types";
import { ARCH_EDGES, ARCH_NODES } from "@/lib/academy/architecture";
import { TOPIC_BY_ID } from "@/lib/academy/topics";
import { Card, Eyebrow, FileRefList, LabeledSection, TopicChip } from "./ui";

const W = 1000;
const H = 800;
const sx = (v: number) => (v / 100) * W;
const sy = (v: number) => (v / 100) * H + 10;

const TONE_FILL: Record<string, { fill: string; stroke: string; text: string }> = {
  data: { fill: "#ecfeff", stroke: "#0891b2", text: "#155e75" },
  backend: { fill: "#eff6ff", stroke: "#105dff", text: "#1e3a8a" },
  ml: { fill: "#fdf2f8", stroke: "#db2777", text: "#9d174d" },
  ai: { fill: "#f5f3ff", stroke: "#7c3aed", text: "#5b21b6" },
  external: { fill: "#f8fafc", stroke: "#94a3b8", text: "#475569" },
};

function center(n: ArchNode) {
  return { x: sx(n.x + n.w / 2), y: sy(n.y + n.h / 2) };
}

export function ArchitectureMap() {
  const [selectedId, setSelectedId] = useState<string>("raw");
  const selected = ARCH_NODES.find((n) => n.id === selectedId)!;
  const byId = Object.fromEntries(ARCH_NODES.map((n) => [n.id, n]));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="p-3">
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[700px]" style={{ width: "100%" }} role="img" aria-label="AxonFlux system architecture">
            {ARCH_EDGES.map((e, i) => {
              const a = byId[e.from];
              const b = byId[e.to];
              if (!a || !b) return null;
              const ca = center(a);
              const cb = center(b);
              const lit = selectedId === e.from || selectedId === e.to;
              const mx = (ca.x + cb.x) / 2;
              const my = (ca.y + cb.y) / 2;
              return (
                <g key={i}>
                  <line
                    x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y}
                    stroke={lit ? "#105dff" : "#cbd5e1"}
                    strokeWidth={lit ? 2 : 1.2}
                    strokeOpacity={lit ? 0.85 : 0.6}
                  />
                  {e.label && lit && (
                    <text x={mx} y={my - 5} textAnchor="middle" fontSize={10.5} className="font-mono" fill="#105dff">
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {ARCH_NODES.map((n) => {
              const tone = TONE_FILL[n.tone];
              const active = n.id === selectedId;
              return (
                <g key={n.id} className="cursor-pointer" onClick={() => setSelectedId(n.id)}>
                  <rect
                    x={sx(n.x)} y={sy(n.y)} width={sx(n.w)} height={(n.h / 100) * H}
                    rx={10}
                    fill={tone.fill}
                    stroke={active ? "#1b293e" : tone.stroke}
                    strokeWidth={active ? 2.5 : 1.5}
                  />
                  <text x={sx(n.x + n.w / 2)} y={sy(n.y) + 26} textAnchor="middle" fontSize={14.5} fontWeight={600} fill={tone.text}>
                    {n.label}
                  </text>
                  <text x={sx(n.x + n.w / 2)} y={sy(n.y) + 46} textAnchor="middle" fontSize={10.5} className="font-mono" fill="#64748b">
                    {n.sublabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="mt-2 px-1 text-xs text-gray-500">
          Click any component. Highlighted lines show its data flows.
        </p>
      </Card>

      <Card className="max-h-[720px] overflow-y-auto p-5">
        <Eyebrow>{selected.sublabel}</Eyebrow>
        <h2 className="mt-1 text-lg font-bold text-[#1b293e]">{selected.label}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{selected.purpose}</p>

        <div className="mt-4 space-y-4">
          <LabeledSection label="Responsibilities">
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {selected.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </LabeledSection>
          <LabeledSection label="Why this design">
            <p className="text-sm leading-relaxed text-gray-700">{selected.whyThisDesign}</p>
          </LabeledSection>
          <LabeledSection label="Alternatives considered">
            <p className="text-sm leading-relaxed text-gray-700">{selected.alternatives}</p>
          </LabeledSection>
          <LabeledSection label="Trade-offs">
            <p className="text-sm leading-relaxed text-gray-700">{selected.tradeoffs}</p>
          </LabeledSection>
          <LabeledSection label="Interview questions to expect">
            <ul className="space-y-1.5 text-sm text-gray-700">
              {selected.interview.map((q, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">“{q}”</li>
              ))}
            </ul>
          </LabeledSection>
          <LabeledSection label="Code">
            <FileRefList files={selected.files} />
          </LabeledSection>
          {selected.relatedTopics.length > 0 && (
            <LabeledSection label="Theory behind it">
              <div className="flex flex-wrap gap-2">
                {selected.relatedTopics
                  .filter((t) => TOPIC_BY_ID[t])
                  .map((t) => (
                    <TopicChip key={t} id={t} title={TOPIC_BY_ID[t].title} />
                  ))}
              </div>
            </LabeledSection>
          )}
        </div>
      </Card>
    </div>
  );
}
