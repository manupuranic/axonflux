"use client";

// The Academy's signature element: the knowledge constellation.
// Nodes are topics (fill = your confidence, ring = domain, dashed = frontier);
// axon lines are prerequisite edges. Recommended-next nodes pulse.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Confidence, Topic } from "@/lib/academy/types";
import { CONFIDENCE_META, DOMAIN_META } from "@/lib/academy/types";
import { EDGES, TOPICS } from "@/lib/academy/topics";

const W = 1280;
const H = 720;
const sx = (x: number) => 40 + (x / 100) * (W - 80);
const sy = (y: number) => 36 + (y / 100) * (H - 90);

export function SynapseMap({
  confidenceOf,
  recommendedIds = [],
  height = "auto",
}: {
  confidenceOf: (id: string) => Confidence;
  recommendedIds?: string[];
  height?: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const recommended = useMemo(() => new Set(recommendedIds), [recommendedIds]);

  const neighborhood = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    EDGES.forEach((e) => {
      if (e.from === hover) s.add(e.to);
      if (e.to === hover) s.add(e.from);
    });
    return s;
  }, [hover]);

  const hovered: Topic | undefined = TOPICS.find((t) => t.id === hover);

  return (
    <div className="relative">
      <style>{`
        @keyframes synapse-pulse {
          0%, 100% { stroke-opacity: 0.9; r: 11; }
          50% { stroke-opacity: 0.25; r: 15; }
        }
        @media (prefers-reduced-motion: reduce) {
          .synapse-pulse-ring { animation: none !important; }
        }
      `}</style>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="min-w-[760px]"
          style={{ width: "100%", height }}
          role="img"
          aria-label="Knowledge graph of AxonFlux topics"
        >
          {/* Domain column labels — six bands, ordered fundamentals → application */}
          {(["cs", "data", "backend", "systems", "ml", "ai"] as const).map((d, i) => (
            <text
              key={d}
              x={sx([9.5, 25.5, 41.5, 57.5, 73.5, 89.5][i])}
              y={18}
              textAnchor="middle"
              className="font-mono"
              fontSize={10}
              letterSpacing={1.5}
              fill={DOMAIN_META[d].color}
              opacity={0.75}
            >
              {DOMAIN_META[d].label.toUpperCase()}
            </text>
          ))}

          {/* Edges */}
          {EDGES.map((e) => {
            const a = TOPICS.find((t) => t.id === e.from);
            const b = TOPICS.find((t) => t.id === e.to);
            if (!a || !b) return null;
            const lit =
              neighborhood && (neighborhood.has(a.id) && neighborhood.has(b.id)) &&
              (a.id === hover || b.id === hover);
            return (
              <line
                key={`${e.from}-${e.to}`}
                x1={sx(a.pos.x)}
                y1={sy(a.pos.y)}
                x2={sx(b.pos.x)}
                y2={sy(b.pos.y)}
                stroke={lit ? "#105dff" : "#94a3b8"}
                strokeWidth={lit ? 2 : 1}
                strokeOpacity={neighborhood ? (lit ? 0.9 : 0.12) : 0.3}
              />
            );
          })}

          {/* Nodes */}
          {TOPICS.map((t) => {
            const cx = sx(t.pos.x);
            const cy = sy(t.pos.y);
            const conf = confidenceOf(t.id);
            const dimmed = neighborhood ? !neighborhood.has(t.id) : false;
            const isRec = recommended.has(t.id);
            return (
              <g
                key={t.id}
                opacity={dimmed ? 0.25 : 1}
                className="cursor-pointer"
                onMouseEnter={() => setHover(t.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/academy/topics/${t.id}`)}
              >
                {isRec && (
                  <circle
                    className="synapse-pulse-ring"
                    cx={cx}
                    cy={cy}
                    r={12}
                    fill="none"
                    stroke="#105dff"
                    strokeWidth={2}
                    style={{ animation: "synapse-pulse 2s ease-in-out infinite" }}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={8}
                  fill={CONFIDENCE_META[conf].color}
                  fillOpacity={conf === "none" ? 0.35 : 0.95}
                  stroke={DOMAIN_META[t.domain].color}
                  strokeWidth={2.5}
                  strokeDasharray={t.status === "planned" ? "3 2.5" : undefined}
                />
                <text
                  x={cx}
                  y={cy + 21}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill={hover === t.id ? "#105dff" : "#475569"}
                  fontWeight={hover === t.id ? 600 : 400}
                >
                  {t.title.length > 30 ? t.title.slice(0, 28) + "…" : t.title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover detail strip */}
      <div className="mt-1 min-h-[44px] rounded-lg border border-gray-100 bg-slate-50 px-3 py-2 text-sm">
        {hovered ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-[#1b293e]">{hovered.title}</span>
            <span className="text-gray-500">— {hovered.tagline}.</span>
            <span className="text-xs text-gray-400">Click to open.</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="font-mono uppercase tracking-wider text-gray-400">legend</span>
            {(Object.keys(CONFIDENCE_META) as Confidence[]).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CONFIDENCE_META[c].color, opacity: c === "none" ? 0.4 : 1 }} />
                {CONFIDENCE_META[c].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-gray-400" />
              frontier topic
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-blue-400 opacity-60" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#105dff]" />
              </span>
              recommended next
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
