"use client";

import { useEffect, useState } from "react";
import { Section } from "../Section";
import { fadeInUp, m } from "../motion";
import { cn } from "@/lib/utils";

type Step = {
  num: string;
  table: string;
  rows?: string;
  blurb: string;
  detail: string;
  depends?: string;
};

const STEPS: Step[] = [
  {
    num: "00",
    table: "daily_sales_summary + daily_purchase_summary",
    blurb: "Daily aggregates. Anchors the date spine.",
    detail:
      "Must run first — step 01 reads MIN(business_date) from this table to anchor generate_series. If 00 is stale, the spine starts at the wrong day.",
  },
  {
    num: "01",
    table: "product_daily_metrics",
    rows: "~2.3M",
    blurb: "Dense (date × product) time series.",
    detail:
      "generate_series(min_date, CURRENT_DATE) × product_universe. LEFT JOIN sales_per_day, COALESCE 0. Alias remap happens here at aggregation source.",
    depends: "00",
  },
  {
    num: "02",
    table: "product_daily_features",
    blurb: "Lag, rolling, stddev, day-of-week.",
    detail:
      "LAG(1), LAG(7), AVG OVER (ROWS BETWEEN 6/29/59 PRECEDING AND CURRENT ROW), STDDEV_SAMP. Single named-window plan reused four times.",
    depends: "01",
  },
  {
    num: "03",
    table: "product_health_signals",
    blurb: "Fast / slow / dead / spike flags.",
    detail:
      "Classifies via thresholds on rolling avg + day-of-week-aware comparison. Includes predicted_daily_demand (SQL weighted moving average — Phase B1 swaps in ML).",
    depends: "02",
  },
  {
    num: "04",
    table: "product_stock_position",
    blurb: "Cumulative pseudo-stock.",
    detail:
      "SUM(qty_in - qty_out) OVER (PARTITION BY barcode ORDER BY business_date). Can go negative — surfaced honestly in UI as 'estimate unreliable'.",
    depends: "01",
  },
  {
    num: "05",
    table: "Dimension views",
    blurb: "product_dimension · supplier_location · product_supplier_mapping",
    detail:
      "Thin JOIN helpers — no aggregation. Latest item combinations + supplier-product mapping computed here.",
    depends: "03 04",
  },
  {
    num: "06",
    table: "supplier_restock_recommendations",
    blurb: "Procurement intelligence.",
    detail:
      "Combines health signals + stock position + supplier lead times into actionable reorder rows. Output of derived.replenishment_sheet view.",
    depends: "05",
  },
  {
    num: "07",
    table: "daily_payment_breakdown",
    blurb: "Cash / card / UPI / credit by day.",
    detail:
      "Bill-level data only — payment columns don't exist on itemwise. Uses actual_cash (net) not cash_amount (gross).",
    depends: "00",
  },
  {
    num: "08",
    table: "customer_dimension",
    blurb: "One row per normalized mobile + WALK-IN.",
    detail:
      "Mobile normalization regex cascade. Walk-in name list collapses NULL/CASH/SUNDRY etc into the synthetic key 'WALK-IN'.",
    depends: "00",
  },
  {
    num: "09",
    table: "customer_metrics",
    blurb: "Per-customer spend, recency, payment preference.",
    detail:
      "MODE() WITHIN GROUP picks canonical display name when same customer appears under name variants. Aggregates across mobile_clean.",
    depends: "08",
  },
];

export function PipelineStepper() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setActive((i) => {
        const next = i + 1;
        if (next >= STEPS.length) {
          setPlaying(false);
          return i;
        }
        return next;
      });
    }, 1100);
    return () => clearInterval(id);
  }, [playing]);

  const current = STEPS[active];

  return (
    <Section
      id="pipeline"
      eyebrow="Rebuild contract"
      title="Ten ordered SQL steps"
      description="Click a step to inspect it. The order is a hard dependency chain — later steps JOIN against earlier ones."
    >
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* Step rail */}
        <div className="px-4 py-5 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-700">{active + 1}</span> / {STEPS.length}
            </p>
            <button
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                } else {
                  setActive(0);
                  setPlaying(true);
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {playing ? (
                <>
                  <span className="h-2 w-2 rounded-sm bg-blue-600" /> stop
                </>
              ) : (
                <>
                  <span className="h-0 w-0 border-l-[6px] border-l-blue-600 border-y-[4px] border-y-transparent" /> auto-advance
                </>
              )}
            </button>
          </div>

          <div className="relative">
            {/* track */}
            <div className="absolute left-0 right-0 top-3.5 h-0.5 bg-slate-200" />
            <m.div
              className="absolute left-0 top-3.5 h-0.5 bg-gradient-to-r from-blue-500 to-slate-1000"
              animate={{ width: `${(active / (STEPS.length - 1)) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
            <div className="relative grid grid-cols-10 gap-1">
              {STEPS.map((s, i) => (
                <button
                  key={s.num}
                  onClick={() => {
                    setPlaying(false);
                    setActive(i);
                  }}
                  className="flex flex-col items-center gap-1 group"
                  aria-label={`Step ${s.num}: ${s.table}`}
                >
                  <m.div
                    animate={{
                      scale: i === active ? 1.15 : 1,
                      backgroundColor: i <= active ? "#2563eb" : "#e2e8f0",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="relative h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-mono font-bold"
                  >
                    <span className={cn(i <= active ? "text-white" : "text-slate-500")}>{s.num}</span>
                  </m.div>
                  <span className={cn("text-[10px] font-mono", i === active ? "text-blue-700 font-semibold" : "text-slate-400")}>
                    {s.num}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active step detail */}
        <m.div
          key={active}
          variants={fadeInUp}
          initial="hidden"
          animate="show"
          className="p-6 md:p-8"
        >
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <span className="inline-flex items-center rounded-md bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-mono font-semibold">
              step {current.num}
            </span>
            {current.rows && (
              <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-mono">
                {current.rows} rows
              </span>
            )}
            {current.depends && (
              <span className="text-xs text-slate-500">
                depends on:{" "}
                <span className="font-mono text-slate-700">{current.depends}</span>
              </span>
            )}
          </div>
          <h3 className="font-mono text-lg font-bold text-slate-900 break-words">
            derived.{current.table}
          </h3>
          <p className="mt-2 text-base text-slate-700">{current.blurb}</p>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">{current.detail}</p>

          <div className="mt-6 flex justify-between gap-3">
            <button
              onClick={() => setActive((i) => Math.max(0, i - 1))}
              disabled={active === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← prev
            </button>
            <button
              onClick={() => setActive((i) => Math.min(STEPS.length - 1, i + 1))}
              disabled={active === STEPS.length - 1}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              next →
            </button>
          </div>
        </m.div>
      </div>
    </Section>
  );
}
