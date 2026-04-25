"use client";

import { Section, Callout } from "../Section";
import { fadeInUp, m, stagger } from "../motion";

const ROWS = [
  {
    decision: "Storage engine",
    chosen: "Postgres",
    rejected: "BigQuery / Snowflake",
    why: "Single-store data volume. Ops cost of a managed warehouse > value at this scale.",
  },
  {
    decision: "Pipeline strategy",
    chosen: "Full rebuild",
    rejected: "Incremental + watermark",
    why: "Logic-change replay > runtime perf at 2.3M rows.",
  },
  {
    decision: "Product identity",
    chosen: "Barcode (TEXT)",
    rejected: "Surrogate UUID",
    why: "Barcode is what every export already keys on. Surrogate would need a perfect resolution map upfront — we don't have one.",
  },
  {
    decision: "Raw cleaning",
    chosen: "None — verbatim",
    rejected: "Clean on ingest",
    why: "Lose source of truth. Create un-debuggable corruption.",
  },
  {
    decision: "Customer identity",
    chosen: "Normalized 10-digit mobile",
    rejected: "Composite (mobile + name)",
    why: "Mobile is the only stable signal. Name varies by cashier mood.",
  },
  {
    decision: "App data location",
    chosen: "Separate app.* schema",
    rejected: "Columns in derived.*",
    why: "Truncating derived would erase human work. Schema-level isolation.",
  },
  {
    decision: "Tool packaging",
    chosen: "Plugin pattern",
    rejected: "Hardcoded routers",
    why: "Tools are operational features. Staff add new ones over time. ADR-002.",
  },
  {
    decision: "Frontend rendering",
    chosen: "Next.js + React",
    rejected: "SSR-only HTML",
    why: "Dashboard is interactive — drawers, charts, modals. SSR-only would fight us.",
  },
];

export function Tradeoffs() {
  return (
    <Section
      id="tradeoffs"
      eyebrow="Decisions, not preferences"
      title="What we picked, what we rejected, why"
      description="Every row was a fork in the road. The 'why' column is more valuable than the 'chosen' column."
    >
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Decision
                </th>
                <th className="py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-emerald-600">
                  Chosen
                </th>
                <th className="py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                  Rejected
                </th>
                <th className="py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Why
                </th>
              </tr>
            </thead>
            <m.tbody
              variants={stagger(0.04)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.1 }}
              className="divide-y divide-slate-100"
            >
              {ROWS.map((r) => (
                <m.tr
                  key={r.decision}
                  variants={fadeInUp}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  <td className="py-3 px-4 font-medium text-slate-900 align-top">{r.decision}</td>
                  <td className="py-3 px-4 align-top">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[12.5px] text-emerald-700 font-medium">
                      ✓ {r.chosen}
                    </span>
                  </td>
                  <td className="py-3 px-4 align-top text-[12.5px] text-slate-400 line-through">
                    {r.rejected}
                  </td>
                  <td className="py-3 px-4 align-top text-[12.5px] text-slate-600 leading-relaxed">
                    {r.why}
                  </td>
                </m.tr>
              ))}
            </m.tbody>
          </table>
        </div>
      </div>

      <m.div
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        className="mt-6"
      >
        <Callout tone="fire">
          <strong>Hindsight bet.</strong> Add column-level lineage from day one. Knowing which raw
          columns feed each derived field would 10× debugging speed when staff ask <em>"why did this
          number change?"</em>
        </Callout>
      </m.div>
    </Section>
  );
}
