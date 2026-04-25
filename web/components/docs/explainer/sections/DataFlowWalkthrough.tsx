"use client";

import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";

const FLOW = [
  {
    n: 1,
    title: "File arrives in data/incoming/",
    body:
      "A staff member exports a sales report and drops it into the watched folder. Or scripts/er4u_export.py (Playwright) does it automatically every morning.",
    artifact: "data/incoming/sales_2026-04-25.xlsx",
  },
  {
    n: 2,
    title: "Ingestion module routes it",
    body:
      "scripts/ingest_all.py picks the latest file per report type, computes SHA-256, and hands it to the matching module under raw_ingestion/. Each module shares a HEADER_MAP + reader + ingest_core call.",
    artifact: "raw_ingestion/sales_itemwise/ingest.py",
  },
  {
    n: 3,
    title: "Insert into raw.* with audit metadata",
    body:
      "Chunked insert (2000 rows per chunk). Every row gets import_batch_id (UUID) + source_file_name. Batch row written to raw.ingestion_batches with hash + row count + timestamps.",
    artifact: "raw.raw_sales_itemwise (+1 batch row)",
  },
  {
    n: 4,
    title: "Pipeline trigger",
    body:
      "POST /api/pipeline/trigger spawns weekly_pipeline.py as a subprocess (API never imports the pipeline). Run is recorded in app.pipeline_runs with streaming log output.",
    artifact: "POST /api/pipeline/trigger",
  },
  {
    n: 5,
    title: "Truncate + rebuild derived.*",
    body:
      "10 SQL files run in order. Each TRUNCATE then INSERT. Alias remap + COALESCE pulls in app.* overrides at aggregation source.",
    artifact: "sql/rebuild_derived/00 → 09",
  },
  {
    n: 6,
    title: "Read path serves UI",
    body:
      "API routers query derived with raw SQL, JOIN app for human overrides, return JSON. Next.js dashboard renders KPIs, charts, tables, drawers.",
    artifact: "GET /api/analytics/summary → dashboard",
  },
];

export function DataFlowWalkthrough() {
  return (
    <Section
      id="dataflow"
      eyebrow="End-to-end"
      title="From export click to dashboard pixel"
      description="Six steps. Each step is bounded — no implicit state between them."
    >
      <m.ol
        variants={stagger(0.12)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="relative space-y-4"
      >
        {/* vertical track */}
        <div className="absolute left-[15px] top-3 bottom-3 w-px bg-gradient-to-b from-blue-300 via-blue-400 to-slate-500 -z-0" />

        {FLOW.map((step) => (
          <m.li
            key={step.n}
            variants={fadeInUp}
            className="relative flex gap-4 items-start group"
          >
            <m.div
              whileHover={{ scale: 1.1 }}
              className="relative z-10 shrink-0 h-8 w-8 rounded-full bg-white border-2 border-blue-300 flex items-center justify-center font-mono text-xs font-bold text-blue-700 group-hover:border-blue-500 transition-colors"
            >
              {step.n}
            </m.div>
            <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all">
              <h3 className="font-semibold text-slate-900 text-sm">{step.title}</h3>
              <p className="mt-1.5 text-[13px] text-slate-600 leading-relaxed">{step.body}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                <span className="text-slate-400">→</span>
                {step.artifact}
              </p>
            </div>
          </m.li>
        ))}
      </m.ol>
    </Section>
  );
}
