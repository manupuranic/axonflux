"use client";

import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";
import { cn } from "@/lib/utils";

type Entry = {
  date: string;
  title: string;
  detail: string;
  type: "feature" | "doc" | "refactor" | "polish" | "fix" | "learning";
};

const ENTRIES: Entry[] = [
  {
    date: "2026-04-26",
    title: "B1 pre-flight: calendar dim + stockout censoring + ML predictions schema",
    detail: "derived.calendar_dim seeded (2,192 rows, 2024–2029) with Indian official holidays + 12 retail festivals with pre/post windows. step 02 restructured to CTE — adds stockout_proxy (80K censored rows), is_holiday, days_to_next_festival. Migration 007: app.ml_demand_predictions(date, product_id, p10, p50, p90).",
    type: "feature",
  },
  {
    date: "2026-04-25",
    title: "Project Explainer (interactive)",
    detail: "Replaced static system design page with component-driven explainer — animations, scroll-spy, flip cards, interactive pipeline stepper, SQL deep dive tabs, interview mode.",
    type: "doc",
  },
  {
    date: "2026-04-25",
    title: "Phase B3 — Product entity resolution",
    detail: "RapidFuzz clustering --min-score 78. Staff review UI at /tools/entity-resolution. Alias remap at aggregation source (steps 01, 05, 10).",
    type: "feature",
  },
  {
    date: "2026-04-22",
    title: "Entity resolution polish",
    detail: "Hover product details (MRP/brand/stock). Swap canonical direction.",
    type: "polish",
  },
  {
    date: "2026-04-20",
    title: "Phase B2 — Basket analysis",
    detail: "30,018 pairs in derived.product_associations. Frequently Bought Together in ProductDrawer.",
    type: "feature",
  },
  {
    date: "2026-04-15",
    title: "Phase A3 — Pamphlet generator",
    detail: "Client-side PDF, AI highlight copy via Claude Haiku, GSheets CSV import.",
    type: "feature",
  },
  {
    date: "2026-04-12",
    title: "Phase A1 — Cash closure UI",
    detail: "EOD count vs system totals, manager verify/reject.",
    type: "feature",
  },
  {
    date: "2026-04-10",
    title: "Phase A2 — Daily ingestion + refresh",
    detail: "Pipeline trigger with run_ingestion flag. er4u_export.py Playwright auto-export.",
    type: "feature",
  },
  {
    date: "2026-04-05",
    title: "Tool plugin system (ADR-002)",
    detail: "api/tools/<name>/ auto-discovered with MANIFEST + router.",
    type: "refactor",
  },
  {
    date: "2026-04-01",
    title: "App schema separation (ADR-001)",
    detail: "app.* for human-authored data; derived.* truncated nightly.",
    type: "refactor",
  },
  {
    date: "2026-03-15",
    title: "10-step rebuild pipeline finalized",
    detail: "Steps 00–09 in deterministic order.",
    type: "feature",
  },
];

const TYPE_META = {
  feature: { label: "Feature", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  doc: { label: "Doc", color: "bg-blue-100 text-blue-700 border-blue-200" },
  refactor: { label: "Refactor", color: "bg-violet-100 text-violet-700 border-violet-200" },
  polish: { label: "Polish", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  fix: { label: "Fix", color: "bg-rose-100 text-rose-700 border-rose-200" },
  learning: { label: "Learning", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

export function Changelog() {
  return (
    <Section
      id="changelog"
      eyebrow="Evolution log"
      title="What shipped, when, why"
      description="Append-only timeline. Newest first. Updates land here when they ship — not when they're planned."
    >
      <div className="relative">
        {/* Vertical track */}
        <div className="absolute left-[12px] top-2 bottom-2 w-px bg-gradient-to-b from-blue-300 via-blue-400 to-slate-500" />

        <m.ol
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.05 }}
          className="space-y-4"
        >
          {ENTRIES.map((entry, i) => (
            <m.li key={i} variants={fadeInUp} className="relative flex gap-4 items-start">
              <m.div
                whileHover={{ scale: 1.3 }}
                className="relative z-10 shrink-0 mt-2 h-[10px] w-[10px] rounded-full bg-white border-2 border-blue-400 ring-4 ring-white"
              />
              <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors">
                <div className="flex items-baseline gap-3 flex-wrap mb-1">
                  <time className="text-[11px] font-mono text-slate-400">{entry.date}</time>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      TYPE_META[entry.type].color
                    )}
                  >
                    {TYPE_META[entry.type].label}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">{entry.title}</h3>
                <p className="mt-1 text-[12.5px] text-slate-600 leading-relaxed">{entry.detail}</p>
              </div>
            </m.li>
          ))}
        </m.ol>
      </div>
    </Section>
  );
}
