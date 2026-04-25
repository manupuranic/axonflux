"use client";

import { useState } from "react";
import { Section, Callout } from "../Section";
import { CodeBlock } from "../CodeBlock";
import { fadeInUp, m } from "../motion";
import { cn } from "@/lib/utils";

type Tab = "query" | "explain" | "why" | "perf";
type Pattern = {
  id: string;
  title: string;
  pitch: string;
  query: string;
  explain: string[];
  why: string;
  perf: string;
};

const PATTERNS: Pattern[] = [
  {
    id: "spine",
    title: "Dense (date × product) time series",
    pitch: "generate_series + cross join. Fills gap days with zeros so window functions behave.",
    query: `WITH date_spine AS (
  SELECT generate_series(
    (SELECT MIN(business_date) FROM derived.daily_sales_summary),
    CURRENT_DATE,
    INTERVAL '1 day'
  )::date AS business_date
),
product_universe AS (
  SELECT DISTINCT
    COALESCE(a.canonical_barcode, s.barcode) AS barcode
  FROM raw.raw_sales_itemwise s
  LEFT JOIN app.product_aliases a ON s.barcode = a.alias_barcode
),
sales_per_day AS (
  SELECT
    DATE(TO_TIMESTAMP(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')) AS business_date,
    COALESCE(a.canonical_barcode, s.barcode) AS barcode,
    SUM(s.qty::numeric)        AS units_sold,
    SUM(s.net_amount::numeric) AS revenue
  FROM raw.raw_sales_itemwise s
  LEFT JOIN app.product_aliases a ON s.barcode = a.alias_barcode
  GROUP BY 1, 2
)
INSERT INTO derived.product_daily_metrics
SELECT
  ds.business_date,
  pu.barcode,
  COALESCE(spd.units_sold, 0) AS units_sold,
  COALESCE(spd.revenue,    0) AS revenue
FROM date_spine ds
CROSS JOIN product_universe pu
LEFT JOIN sales_per_day spd USING (business_date, barcode);`,
    explain: [
      "date_spine — every date from first sale to today, regardless of whether anything sold.",
      "product_universe — every barcode ever seen, after alias remap. Phase B3 plugs in here.",
      "sales_per_day — actual aggregates, also alias-remapped to keep counts consistent.",
      "CROSS JOIN spine × products → every (date, product) pair. LEFT JOIN sales fills where present.",
      "COALESCE(..., 0) zeroes the gaps. That's the whole trick.",
    ],
    why: "Forecasting needs zeros. A model that only sees sale days thinks demand is 'always positive'. A model that sees the zeros learns seasonality, dead stock, and recovery. Stock position needs a continuous spine so cumulative window functions don't skip days.",
    perf: "(business_date, barcode) is the natural primary key — index it. CROSS JOIN of dates × products is bounded by MIN(business_date) instead of an arbitrary anchor — keeps the table to ~2.3M rows.",
  },
  {
    id: "rolling",
    title: "Rolling features and lags",
    pitch: "Named windows, single sort plan, four computations.",
    query: `INSERT INTO derived.product_daily_features
SELECT
  business_date,
  barcode,
  units_sold,
  LAG(units_sold, 1) OVER w   AS lag_1,
  LAG(units_sold, 7) OVER w   AS lag_7,
  AVG(units_sold) OVER w7     AS rolling_avg_7d,
  AVG(units_sold) OVER w30    AS rolling_avg_30d,
  AVG(units_sold) OVER w60    AS rolling_avg_60d,
  STDDEV_SAMP(units_sold) OVER w7 AS rolling_std_7d,
  EXTRACT(DOW FROM business_date) AS day_of_week
FROM derived.product_daily_metrics
WINDOW
  w   AS (PARTITION BY barcode ORDER BY business_date),
  w7  AS (PARTITION BY barcode ORDER BY business_date ROWS BETWEEN 6  PRECEDING AND CURRENT ROW),
  w30 AS (PARTITION BY barcode ORDER BY business_date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW),
  w60 AS (PARTITION BY barcode ORDER BY business_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW);`,
    explain: [
      "WINDOW … AS … — named windows so LAG and the three rolling averages share partition definitions.",
      "ROWS BETWEEN N PRECEDING AND CURRENT ROW — bounded window, deterministic on duplicate dates.",
      "STDDEV_SAMP — sample (n-1) std dev. For volatility detection where we might extrapolate, sample beats population.",
      "EXTRACT(DOW) — 0=Sunday, 6=Saturday. Step 03 uses this to distinguish Tuesday-low from actually-dead.",
    ],
    why: "Lag features are the simplest predictive signal — 'did it sell yesterday or last week?' beats every fancy model on small data. Rolling 7/30/60 capture three regimes: weekly seasonality, monthly trend, quarterly drift.",
    perf: "All four windows partition by barcode, order by business_date → Postgres builds ONE sort plan and reuses it. Big win. Index (barcode, business_date) on the source table accelerates partition scan.",
  },
  {
    id: "mobile",
    title: "Mobile normalization",
    pitch: "Regex cascade collapses 4+ formats into one canonical key.",
    query: `WITH cleaned AS (
  SELECT
    bill_no,
    REGEXP_REPLACE(COALESCE(customer_mobile_raw,''), '[^0-9]', '', 'g') AS digits,
    UPPER(TRIM(COALESCE(customer_name_raw,''))) AS name_clean
  FROM raw.raw_sales_billwise
)
SELECT
  bill_no,
  CASE
    WHEN digits ~ '^91([6-9][0-9]{9})$'    THEN SUBSTRING(digits FROM 3)
    WHEN digits ~ '^0([6-9][0-9]{9})$'     THEN SUBSTRING(digits FROM 2)
    WHEN digits ~ '^[6-9][0-9]{9}$'        THEN digits
    WHEN name_clean = ANY (ARRAY['CASH','MR','PTF','SUNDRY','RETAIL','CUSTOMER',
                                 'CASH CUSTOMER','GENERAL','GENERAL CUSTOMER',
                                 'WALK IN','WALK-IN','WALKIN','RETAIL CUSTOMER','X'])
                                          THEN 'WALK-IN'
    ELSE 'WALK-IN'
  END AS mobile_clean
FROM cleaned;`,
    explain: [
      "REGEXP_REPLACE strips non-digits — handles '+', spaces, parens, dashes uniformly.",
      "First branch: '91' country prefix → drop first 2 chars, validate Indian mobile pattern.",
      "Second branch: leading '0' (legacy STD format) → drop first char.",
      "Third branch: clean 10-digit mobile starting 6-9 → keep as-is.",
      "Fourth branch: walk-in placeholder names → synthetic 'WALK-IN' key.",
      "Default: anything else (NULL, garbage) → also 'WALK-IN'. No customer is silently dropped.",
    ],
    why: "Customer identity is the single most polluted field in retail data. Without normalization, the same person shows up as 4 different customers. Customer metrics, recency, and basket associations all break.",
    perf: "Each branch is individually testable. Optimizer collapses them; readability wins. Plain index on the resulting mobile_clean column powers all customer queries downstream.",
  },
  {
    id: "basket",
    title: "Basket analysis (self-join)",
    pitch: "5M+ row self-join on bill_no. PostgreSQL handles it via hash join + index.",
    query: `WITH pairs AS (
  SELECT
    LEAST(a.barcode, b.barcode)    AS barcode_a,
    GREATEST(a.barcode, b.barcode) AS barcode_b,
    COUNT(DISTINCT a.bill_no)      AS co_occurrences
  FROM raw.raw_sales_itemwise a
  JOIN raw.raw_sales_itemwise b
    ON a.bill_no = b.bill_no
   AND a.barcode != b.barcode
  GROUP BY 1, 2
  HAVING COUNT(DISTINCT a.bill_no) >= 5
)
SELECT
  p.barcode_a, p.barcode_b,
  p.co_occurrences,
  p.co_occurrences * 1.0 / total_bills           AS support,
  p.co_occurrences * 1.0 / bills_with_a          AS confidence_a_to_b,
  p.co_occurrences * 1.0 / bills_with_b          AS confidence_b_to_a,
  (p.co_occurrences * 1.0 / total_bills)
    / ((bills_with_a * 1.0 / total_bills) * (bills_with_b * 1.0 / total_bills)) AS lift
FROM pairs p, ...`,
    explain: [
      "LEAST/GREATEST canonicalize the pair direction so (A,B) and (B,A) collapse to one row.",
      "HAVING ≥ 5 filters statistical noise — pairs that co-occurred fewer times have high variance lift.",
      "Support = P(A∩B). Confidence = P(B|A). Lift = how much more likely vs random.",
      "Lift > 1 = associative. Lift < 1 = repulsive. Lift = 1 = independent.",
    ],
    why: "30,018 pairs from ~500K bills. Surfaces 'frequently bought together' in product detail + drawer. The retailer can plan endcaps, bundles, and combo discounts off real signal — not vendor pitches.",
    perf: "Self-join sounds expensive. PostgreSQL hash-joins on indexed bill_no. The HAVING filter prunes to <50K pairs before the lift calculation. Rebuilds in seconds on every pipeline run.",
  },
];

const TAB_LABELS: Record<Tab, string> = {
  query: "Query",
  explain: "Line-by-line",
  why: "Why it matters",
  perf: "Optimization",
};

export function SqlDeepDive() {
  const [activePattern, setActivePattern] = useState(0);
  const [tab, setTab] = useState<Tab>("query");
  const p = PATTERNS[activePattern];

  return (
    <Section
      id="sql"
      eyebrow="The hard parts are SQL"
      title="Four patterns that earn their keep"
      description="Each pattern: the query, what every clause does, why it matters for analytics, and the perf reasoning."
    >
      {/* Pattern selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PATTERNS.map((pat, i) => (
          <button
            key={pat.id}
            onClick={() => {
              setActivePattern(i);
              setTab("query");
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-all",
              activePattern === i
                ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {pat.title}
          </button>
        ))}
      </div>

      <m.div
        key={p.id}
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
          <p className="text-sm text-slate-500 mt-1">{p.pitch}</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t ? "text-blue-700" : "text-slate-500 hover:text-slate-800"
              )}
            >
              {TAB_LABELS[t]}
              {tab === t && (
                <m.span
                  layoutId="sql-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <m.div
          key={`${p.id}-${tab}`}
          variants={fadeInUp}
          initial="hidden"
          animate="show"
          className="p-6"
        >
          {tab === "query" && <CodeBlock code={p.query} language="sql" />}
          {tab === "explain" && (
            <ol className="space-y-3 list-none">
              {p.explain.map((line, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-700 text-[11px] font-mono font-bold">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ol>
          )}
          {tab === "why" && (
            <Callout tone="info">
              <p className="text-[14px] leading-relaxed">{p.why}</p>
            </Callout>
          )}
          {tab === "perf" && (
            <Callout tone="fire">
              <p className="text-[14px] leading-relaxed">{p.perf}</p>
            </Callout>
          )}
        </m.div>
      </m.div>
    </Section>
  );
}
