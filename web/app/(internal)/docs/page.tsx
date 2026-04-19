export default function SystemDesignPage() {
  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">System Design</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Architecture, data engineering patterns, and design decisions — updated as the system
          evolves. Useful for onboarding and interviews.
        </p>
      </div>

      {/* ── 1. Problem statement ──────────────────────────────────── */}
      <Section title="1. Problem Statement">
        <p>
          A supermarket uses off-the-shelf billing software that has <strong>no API</strong>. Staff
          periodically export reports as Excel/CSV files (sales itemwise, sales billwise, purchase
          itemwise, purchase billwise, supplier master, item combinations). LedgerAI ingests those
          exports, maintains an immutable record of every transaction, rebuilds analytical views on
          demand, and exposes the results through a REST API and web dashboard.
        </p>
        <p className="mt-2">
          The core constraint: <strong>source data is batch, not streaming</strong>. Everything is
          designed around weekly (or on-demand) full rebuilds rather than incremental updates.
        </p>
      </Section>

      {/* ── 2. Three-layer architecture ──────────────────────────── */}
      <Section title="2. Three-Layer Database Architecture">
        <p>
          All data lives in a single PostgreSQL instance divided into three schemas. Each layer has
          a single job and a hard rule about mutation.
        </p>

        <SubSection title="raw.* — Immutable source of truth">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              Append-only. Rows are <strong>never updated or deleted</strong> after ingestion.
            </li>
            <li>
              Every row carries an <code>import_batch_id</code> (UUID) and{" "}
              <code>source_file_name</code> for full auditability.
            </li>
            <li>
              Duplicate file detection via SHA-256 hash stored in{" "}
              <code>raw.ingestion_batches</code>. Re-importing the same file is a no-op.
            </li>
            <li>
              Six tables: <code>raw_sales_itemwise</code>, <code>raw_sales_billwise</code>,{" "}
              <code>raw_purchase_itemwise</code>, <code>raw_purchase_billwise</code>,{" "}
              <code>raw_supplier_master</code>, <code>raw_item_combinations</code>.
            </li>
          </ul>
          <Callout>
            Interview angle: this is the <strong>ELT pattern</strong> (Extract → Load raw →
            Transform in-DB), not ETL. Keeping raw data intact means you can reprocess historical
            data whenever the business logic changes — you never need the original files again.
          </Callout>
        </SubSection>

        <SubSection title="derived.* — Rebuildable analytics">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Fully truncated and rebuilt on every pipeline run.</strong> Never store
              application state here.
            </li>
            <li>
              Built by running ten SQL files in strict order (see Pipeline section below).
            </li>
            <li>
              Idempotent: running the pipeline twice produces identical results. Safe to re-run at
              any time.
            </li>
          </ul>
          <Callout>
            Interview angle: <strong>idempotency</strong> is the key design goal. TRUNCATE +
            INSERT inside a transaction means the table is either fully current or untouched — no
            partial states possible.
          </Callout>
        </SubSection>

        <SubSection title="app.* — Durable application state">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              Human-authored data that must survive pipeline rebuilds: canonical product names,
              user accounts, pipeline run logs, cash closure records.
            </li>
            <li>
              Managed by <strong>Alembic</strong> migrations. Schema changes are versioned and
              repeatable.
            </li>
            <li>
              Joins to <code>derived.*</code> use a graceful fallback pattern:{" "}
              <code>COALESCE(app.canonical_name, derived.product_name)</code> — app data enriches
              analytics without replacing it.
            </li>
          </ul>
        </SubSection>
      </Section>

      {/* ── 3. Pipeline (rebuild sequence) ───────────────────────── */}
      <Section title="3. The Rebuild Pipeline">
        <p>
          The pipeline is a Python script (<code>pipelines/weekly_pipeline.py</code>) that runs ten
          SQL files in order. Each file does a TRUNCATE + INSERT for one derived table. The
          ordering is a hard dependency chain — later steps JOIN against earlier ones.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Step</th>
                <th className="pb-2 pr-4 font-medium">Table</th>
                <th className="pb-2 font-medium">Key concept</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ["00", "daily_sales_summary + daily_purchase_summary", "Anchor for date spine (MIN sale_date)"],
                ["01", "product_daily_metrics", "Date spine via generate_series — fills gaps with 0s"],
                ["02", "product_daily_features", "Lag features, rolling 7/30/60-day averages, stddev"],
                ["03", "product_health_signals", "Fast/slow/dead stock flags + predicted daily demand"],
                ["04", "product_stock_position", "Cumulative pseudo-stock via window SUM"],
                ["05", "Views (dimension, supplier, mapping)", "Thin JOIN helpers — no aggregation"],
                ["06", "supplier_restock_recommendations", "Procurement intelligence with lead times"],
                ["07", "daily_payment_breakdown", "Cash/card/UPI/credit split from bill-level data"],
                ["08", "customer_dimension", "One row per normalized mobile + one WALK-IN row"],
                ["09", "customer_metrics", "Per-customer spend, recency, preferred payment"],
              ].map(([step, table, concept]) => (
                <tr key={step} className="text-sm">
                  <td className="py-2 pr-4 font-mono text-gray-500">{step}</td>
                  <td className="py-2 pr-4 text-gray-800">{table}</td>
                  <td className="py-2 text-gray-600">{concept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 4. Key data engineering patterns ─────────────────────── */}
      <Section title="4. Data Engineering Patterns">
        <SubSection title="Date Spine (generate_series)">
          <p>
            Raw sales data has gaps — no sales on Sundays, public holidays, etc. Analytical queries
            like "7-day rolling average" break on sparse data. The solution is a{" "}
            <strong>date spine</strong>: a complete sequence of every date from the first sale to
            today, cross-joined with every product.
          </p>
          <CodeBlock>{`-- Step 01 creates ~2.3M rows (dates × products)
SELECT d.date, p.barcode
FROM generate_series(
  (SELECT MIN(sale_date) FROM derived.daily_sales_summary),
  CURRENT_DATE,
  '1 day'::interval
) AS d(date)
CROSS JOIN (SELECT DISTINCT barcode FROM raw.raw_sales_itemwise) p
LEFT JOIN raw_sales_itemwise rsi ON ...`}</CodeBlock>
          <Callout>
            Interview angle: date spines let you use window functions reliably. Without them,
            LAG(1) skips weekends and your rolling averages become meaningless.
          </Callout>
        </SubSection>

        <SubSection title="Window Functions for Forecasting">
          <p>
            Step 02 computes rolling statistics using SQL window functions — no Python, no external
            libraries. This keeps everything in the DB where the data already lives.
          </p>
          <CodeBlock>{`AVG(qty_sold) OVER (
  PARTITION BY barcode
  ORDER BY date
  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
) AS rolling_7d_avg,

STDDEV(qty_sold) OVER (
  PARTITION BY barcode
  ORDER BY date
  ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
) AS rolling_30d_stddev`}</CodeBlock>
          <p className="mt-2 text-sm text-gray-600">
            Step 03 uses these to classify products: fast-moving (high avg), dead stock (zero
            sales in 30d), demand spike (current &gt; avg + 2×stddev).
          </p>
        </SubSection>

        <SubSection title="Mobile Number Normalization">
          <p>
            Customer mobile numbers arrive in four formats from the billing export:{" "}
            <code>9876543210</code>, <code>09876543210</code>, <code>+919876543210</code>,{" "}
            <code>919876543210</code>. A single CASE expression in SQL normalizes all to a clean
            10-digit string:
          </p>
          <CodeBlock>{`CASE
  WHEN digits ~ '^91([6-9][0-9]{9})$' THEN SUBSTRING(digits FROM 3)
  WHEN digits ~ '^0([6-9][0-9]{9})$'  THEN SUBSTRING(digits FROM 2)
  WHEN digits ~ '^[6-9][0-9]{9}$'     THEN digits
  ELSE NULL  -- invalid → walk-in pool
END AS mobile_clean`}</CodeBlock>
          <p className="mt-2 text-sm text-gray-600">
            Invalid mobiles and known walk-in names (CASH, X, SUNDRY…) are grouped under the
            synthetic key <code>'WALK-IN'</code> — a single row that aggregates all anonymous
            transactions.
          </p>
        </SubSection>

        <SubSection title="MODE() for Most-Frequent Value">
          <p>
            A customer may have used different name spellings across visits. To pick the canonical
            display name, we use PostgreSQL's ordered-set aggregate:
          </p>
          <CodeBlock>{`MODE() WITHIN GROUP (ORDER BY customer_name_raw) AS display_name`}</CodeBlock>
          <p className="mt-2 text-sm text-gray-600">
            This is an <strong>ordered-set aggregate</strong> — one of PostgreSQL's less-known
            features. It computes the statistical mode (most frequent value) in a single SQL pass,
            no subquery needed.
          </p>
        </SubSection>

        <SubSection title="Idempotency via TRUNCATE + INSERT">
          <p>
            Every derived table rebuild follows the same two-statement pattern:
          </p>
          <CodeBlock>{`TRUNCATE TABLE derived.some_table;
INSERT INTO derived.some_table (...) SELECT ... FROM raw.*;`}</CodeBlock>
          <p className="mt-2 text-sm text-gray-600">
            TRUNCATE is DDL in PostgreSQL (auto-commits), but since the derived tables are
            read-only snapshots that are fully replaced, partial state is acceptable — reads against
            a partially-rebuilt table are rare and bounded by the pipeline runtime (seconds to
            minutes). For production SLAs, the pattern can be upgraded to a table swap:
            build into a temp table, then{" "}
            <code>ALTER TABLE derived.foo RENAME TO foo_old; ALTER TABLE foo_new RENAME TO foo;</code>
          </p>
        </SubSection>
      </Section>

      {/* ── 5. API design ─────────────────────────────────────────── */}
      <Section title="5. API Design (FastAPI)">
        <p>
          The API is a FastAPI application with two database dependency patterns — one for reads,
          one for writes — reflecting the hard split between schemas.
        </p>

        <SubSection title="Two DB Dependency Patterns">
          <CodeBlock>{`# ORM session — for app.* writes (Alembic-managed schema)
def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session

# Raw connection — for derived.* and raw.* reads (plain SQL)
def get_conn():
    with engine.connect() as conn:
        yield conn`}</CodeBlock>
          <p className="mt-2 text-sm text-gray-600">
            Using raw SQL for reads keeps derived-layer queries simple and explicit. SQLAlchemy ORM
            is reserved for the app schema where model relationships matter.
          </p>
        </SubSection>

        <SubSection title="Pipeline as Subprocess">
          <p>
            The API never imports the pipeline directly. Instead,{" "}
            <code>POST /api/pipeline/trigger</code> spawns it as a subprocess:
          </p>
          <CodeBlock>{`proc = subprocess.Popen(
    [sys.executable, str(PIPELINE_SCRIPT), *(["--run-ingestion"] if run_ingestion else [])],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    cwd=str(ROOT), env={**os.environ, "PYTHONPATH": str(ROOT)},
)
# Log output is streamed to app.pipeline_runs.log_output`}</CodeBlock>
          <Callout>
            Interview angle: keeping the pipeline as a subprocess means the API process never gets
            blocked by a long rebuild. It also means the pipeline can be killed, restarted, or
            swapped without touching the API code.
          </Callout>
        </SubSection>

        <SubSection title="Tool Plugin System">
          <p>
            Internal staff tools (cash closure, pamphlet generator) live in{" "}
            <code>api/tools/&lt;name&gt;/</code>. Each tool declares a{" "}
            <code>MANIFEST</code> and an <code>APIRouter</code>. A single{" "}
            <code>register_tools()</code> call auto-discovers and mounts them — adding a new tool
            requires no changes to <code>main.py</code>. This is the{" "}
            <strong>plugin pattern</strong>: open for extension, closed for modification.
          </p>
        </SubSection>
      </Section>

      {/* ── 6. Frontend design ───────────────────────────────────── */}
      <Section title="6. Frontend Design (Next.js)">
        <SubSection title="Client-only Auth (localStorage)">
          <p>
            JWT tokens are stored in <code>localStorage</code>. This means every page under{" "}
            <code>(internal)/</code> must be a Client Component — server components and middleware
            cannot read localStorage. The auth guard is a{" "}
            <code>useEffect</code> in the layout that redirects to <code>/login</code> on missing
            token.
          </p>
          <Callout>
            Trade-off: localStorage is simpler to implement than httpOnly cookies but is vulnerable
            to XSS. For this internal tool (staff-only, no public exposure), the simplicity
            trade-off is acceptable.
          </Callout>
        </SubSection>

        <SubSection title="Two Data Fetching Hooks">
          <p>
            All data fetching uses two custom hooks (no React Query, no SWR):
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm mt-2">
            <li>
              <code>useFetch(fetcher, deps?)</code> — for a single resource (summary, charts).
              Returns <code>{"{ data, loading, error }"}</code>.
            </li>
            <li>
              <code>usePaginatedFetch(fetcher, params, pageSize)</code> — for tables with
              pagination. Detects filter changes via <code>JSON.stringify(params)</code> and resets
              to page 0 automatically.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Number Formatting">
          <p>
            All numbers use the Indian locale (<code>en-IN</code>). Two formats:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm mt-2">
            <li>
              <strong>Compact</strong> — KPI cards: <code>₹12.4L</code>, <code>₹2.1Cr</code>
            </li>
            <li>
              <strong>Full</strong> — tables and tooltips: <code>₹1,24,500</code>
            </li>
          </ul>
        </SubSection>
      </Section>

      {/* ── 7. Key identifiers ───────────────────────────────────── */}
      <Section title="7. Key Identifiers">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Identifier</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 font-medium">Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ["barcode", "TEXT", "Links raw.*, derived.*, app.products — the product key"],
                ["import_batch_id", "UUID", "Groups all rows from one file ingestion"],
                ["mobile_clean", "TEXT (10-digit or 'WALK-IN')", "Canonical customer key in customer_dimension and customer_metrics"],
                ["bill_no", "TEXT", "Transaction key — links billwise and itemwise rows for the same sale"],
              ].map(([id, type, scope]) => (
                <tr key={id}>
                  <td className="py-2 pr-4 font-mono text-blue-700">{id}</td>
                  <td className="py-2 pr-4 text-gray-500">{type}</td>
                  <td className="py-2 text-gray-700">{scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 8. Known quirks ──────────────────────────────────────── */}
      <Section title="8. Known Quirks &amp; Gotchas">
        <ul className="space-y-3 text-sm">
          <li>
            <strong>Date format bug in exports:</strong>{" "}
            <code>bill_datetime_raw</code> stores <code>04-04-202507:29 AM</code> (space missing
            between date and time). Parsed with{" "}
            <code>TO_TIMESTAMP(bill_datetime_raw, &apos;DD-MM-YYYYHH12:MI AM&apos;)</code> — the
            format string works because PostgreSQL is lenient about the missing separator.
          </li>
          <li>
            <strong>Payment columns only on billwise:</strong> <code>raw_sales_billwise</code>{" "}
            has cash/card/UPI/credit columns. <code>raw_sales_itemwise</code> does not. Any
            payment analysis must join at the bill level, not item level.
          </li>
          <li>
            <strong>actual_cash vs cash_amount:</strong> <code>actual_cash</code> is the net cash
            received after returning change. <code>cash_amount</code> is the gross amount tendered.
            Use <code>actual_cash</code> for payment totals.
          </li>
          <li>
            <strong>product_id ≠ barcode in health signals:</strong>{" "}
            <code>derived.product_health_signals</code> exposes <code>product_id</code> (internal
            integer). <code>derived.replenishment_sheet</code> uses <code>barcode</code> (TEXT).
            These are different identifiers — keep them distinct in API interfaces.
          </li>
          <li>
            <strong>daily_sales_summary must run first:</strong> Step 01 reads{" "}
            <code>MIN(sale_date) FROM derived.daily_sales_summary</code> to anchor the date spine.
            If step 00 is skipped or stale, the date spine starts at the wrong date.
          </li>
        </ul>
      </Section>

      {/* ── 9. Pamphlet Generator ────────────────────────────────── */}
      <Section title="9. Pamphlet Generator (Staff Tool)">
        <p>
          A client-side PDF builder for monthly offer pamphlets. No PDF bytes are stored in the
          database — the PDF is generated in the browser on demand and downloaded directly.
        </p>

        <SubSection title="Architecture">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Backend</strong>: <code>api/tools/pamphlets/</code> — full CRUD for pamphlets
              and items, AI highlight endpoint, Google Sheets import. Mounted via the tool plugin
              system at <code>/api/tools/pamphlets</code>.
            </li>
            <li>
              <strong>PDF rendering</strong>: <code>@react-pdf/renderer</code> runs entirely in the
              browser — no server-side PDF generation, no storage cost. The{" "}
              <code>PDFViewer</code> component is loaded with <code>dynamic(ssr: false)</code> to
              avoid server-side import of browser-only APIs.
            </li>
            <li>
              <strong>PNG export</strong>: <code>pdfjs-dist</code> renders each PDF page to an
              HTML canvas at 2× scale, then the canvases are either downloaded individually or
              stitched vertically into a single merged image.
            </li>
            <li>
              <strong>Font</strong>: Geist-Regular.ttf + Geist-Bold.ttf (from Vercel's{" "}
              <code>geist</code> npm package, served from <code>/public/fonts/</code>). Required
              because react-pdf's built-in Helvetica lacks ₹ (U+20B9), and font subset files
              (e.g. Roboto latin + latin-ext) cannot be composited — react-pdf needs a single TTF
              with all required glyphs.
            </li>
          </ul>
        </SubSection>

        <SubSection title="AI Highlight Generation">
          <p>
            <code>POST /api/tools/pamphlets/{"{id}"}/ai/highlights</code> sends all item names +
            prices to <strong>Claude Haiku</strong> (<code>claude-haiku-4-5-20251001</code>) with a
            retail copywriting prompt. The model returns a JSON array of{" "}
            <code>{"{id, highlight_text}"}</code> pairs which are bulk-upserted into{" "}
            <code>app.pamphlet_items</code>. Haiku is used (not Sonnet/Opus) because the task is
            short-form copy — fast and cheap per item.
          </p>
        </SubSection>

        <SubSection title="Google Sheets Import">
          <p>
            Staff can paste a regular Google Sheets URL. The backend auto-converts it to an export
            URL (<code>/export?format=csv</code>), fetches the CSV via httpx, normalizes header
            keys (lowercase, spaces → underscores), and calculates{" "}
            <code>offer_price</code> and <code>highlight_text</code> from{" "}
            <code>discount_type</code> (percent / amount / combo) and{" "}
            <code>discount_value</code> columns.
          </p>
          <Callout>
            Design decision: auto-conversion means staff paste the same URL they already share —
            no need to publish the sheet or copy a separate export URL.
          </Callout>
        </SubSection>
      </Section>

      {/* ── 10. Basket Analysis (B2) ─────────────────────────────── */}
      <Section title="10. Basket Analysis — Frequently Bought Together">
        <p>
          A SQL-only implementation of market basket analysis. No Python, no FP-Growth library —
          just a self-join on <code>bill_no</code> across <code>raw.raw_sales_itemwise</code>.
        </p>

        <SubSection title="Algorithm">
          <p>
            For every pair of products that appear in the same bill, count co-occurrences and
            compute support / confidence / lift:
          </p>
          <CodeBlock>{`-- Co-occurrence pairs (minimum 5 bills to filter noise)
WITH pairs AS (
  SELECT
    LEAST(a.barcode, b.barcode)    AS barcode_a,
    GREATEST(a.barcode, b.barcode) AS barcode_b,
    COUNT(DISTINCT a.bill_no)      AS co_occurrences
  FROM raw.raw_sales_itemwise a
  JOIN raw.raw_sales_itemwise b
    ON a.bill_no = b.bill_no AND a.barcode != b.barcode
  GROUP BY 1, 2
  HAVING COUNT(DISTINCT a.bill_no) >= 5
)
-- Lift = P(A∩B) / (P(A) × P(B))
-- Values > 1 mean co-purchase is non-random`}</CodeBlock>
          <Callout>
            Interview angle: self-join on a 5M+ row table sounds expensive, but PostgreSQL's hash
            join on indexed <code>bill_no</code> handles it. The result is 30,018 pairs from
            ~500K unique bills — fast enough to rebuild on every pipeline run.
          </Callout>
        </SubSection>

        <SubSection title="Metrics">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Support</strong> — fraction of all bills containing both products</li>
            <li><strong>Confidence A→B</strong> — P(B | A): of bills with A, what fraction also have B</li>
            <li><strong>Confidence B→A</strong> — P(A | B): the reverse direction</li>
            <li><strong>Lift</strong> — how much more likely A+B co-occur vs. random chance. Lift &gt; 1 is actionable.</li>
          </ul>
        </SubSection>

        <SubSection title="API + UI">
          <p>
            <code>GET /api/products/{"{barcode}"}/recommendations?limit=6</code> returns the top
            co-purchased products ranked by lift. Displayed in two places: the{" "}
            <strong>product detail page</strong> (full card with confidence %) and the{" "}
            <strong>product drawer</strong> (compact list accessible from the Product Health table
            by clicking any row).
          </p>
          <p className="mt-2 text-sm text-gray-600">
            PostgreSQL <code>NUMERIC</code> columns (confidence, lift) serialize to JSON as strings.
            The frontend coerces with <code>Number(r.lift).toFixed(1)</code> rather than relying on
            type assumptions.
          </p>
        </SubSection>
      </Section>

      {/* ── 11. Deployment ───────────────────────────────────────── */}
      <Section title="11. Deployment &amp; Process Map">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Process</th>
                <th className="pb-2 pr-4 font-medium">Port</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ["PostgreSQL", "5432", "Single instance; three schemas (raw, derived, app)"],
                ["FastAPI (uvicorn)", "8000", "PYTHONPATH=. required for project-relative imports"],
                ["Next.js (dev)", "3000", "Production build served via Nginx or Vercel"],
                ["MLflow UI", "5001", "Model experiment tracking (ml/ directory)"],
              ].map(([proc, port, notes]) => (
                <tr key={proc}>
                  <td className="py-2 pr-4 font-medium text-gray-800">{proc}</td>
                  <td className="py-2 pr-4 font-mono text-gray-500">{port}</td>
                  <td className="py-2 text-gray-600">{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* ── Tiny layout helpers (local to this file — no shared abstraction needed) ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
        {title}
      </h2>
      <div className="text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 space-y-2">
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 rounded-md bg-gray-950 text-gray-100 text-xs p-4 overflow-x-auto leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {children}
    </div>
  );
}
