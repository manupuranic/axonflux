"use client";

import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";

const ROWS = [
  {
    threshold: "~10M rows in product_daily_metrics",
    hurts: "Step 02 rolling-feature CTE sort cost",
    fix: "Materialize partition sort. BRIN index on business_date.",
    horizon: "near",
  },
  {
    threshold: "~50M rows",
    hurts: "Pipeline runtime > 10 min",
    fix: "Move step 01 to incremental: re-derive last 90 days only, append to historical.",
    horizon: "mid",
  },
  {
    threshold: "Multiple stores",
    hurts: "Schema needs a store_id partition key",
    fix: "Add column, partition by store, route reads by store filter.",
    horizon: "mid",
  },
  {
    threshold: "API > 50 RPS",
    hurts: "Pre-aggregated tables hot",
    fix: "Redis cache in front of dashboard summary endpoints. Invalidate on pipeline_run_id.",
    horizon: "near",
  },
  {
    threshold: "ML feature volume",
    hurts: "Postgres struggles with ad-hoc analyst SQL",
    fix: "Export derived.* to Parquet daily. Point notebooks at object storage.",
    horizon: "far",
  },
];

const HORIZON_COLOR = {
  near: "bg-rose-50 text-rose-700",
  mid: "bg-amber-50 text-amber-700",
  far: "bg-slate-100 text-slate-600",
};

export function Scaling() {
  return (
    <Section
      id="scaling"
      eyebrow="What breaks first"
      title="Scaling thresholds"
      description="Today the system runs comfortably on a single Postgres VM. Here's where each layer starts to hurt — and the cheapest fix."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatPill label="Densest table" value="~2.3M rows" sub="Today" />
        <StatPill label="Pipeline runtime" value="minutes" sub="Acceptable" />
        <StatPill label="API latency" value="< 200ms" sub="P95, dashboard endpoints" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <m.div
          variants={stagger(0.06)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="divide-y divide-slate-100"
        >
          {ROWS.map((r) => (
            <m.div
              key={r.threshold}
              variants={fadeInUp}
              className="p-5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900 text-sm">{r.threshold}</h3>
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider " +
                        HORIZON_COLOR[r.horizon as keyof typeof HORIZON_COLOR]
                      }
                    >
                      {r.horizon}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-slate-500">{r.hurts}</p>
                </div>
                <div className="flex-1 min-w-[200px] text-[13px] text-slate-700">
                  <span className="font-medium text-emerald-700">→ </span>
                  {r.fix}
                </div>
              </div>
            </m.div>
          ))}
        </m.div>
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
          Indexing strategy today
        </p>
        <ul className="text-[13px] text-slate-700 space-y-1.5">
          <li>
            <code className="font-mono text-[12px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
              (business_date, barcode)
            </code>{" "}
            BTree on metrics, features, stock position
          </li>
          <li>
            <code className="font-mono text-[12px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
              (barcode)
            </code>{" "}
            on app.products (FK target)
          </li>
          <li>
            <code className="font-mono text-[12px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
              (import_batch_id)
            </code>{" "}
            on every raw.* table (audit queries)
          </li>
          <li>
            <code className="font-mono text-[12px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
              (business_date)
            </code>{" "}
            on daily_sales_summary (date-range filters)
          </li>
        </ul>
      </div>
    </Section>
  );
}

function StatPill({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}
