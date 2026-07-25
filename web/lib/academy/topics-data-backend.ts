import type { Topic } from "./types";

// Data Engineering + Backend Engineering topics.
// status "ready" = fully written; "planned" = frontier topic that gains
// deep content when the corresponding roadmap phase is built.

export const DATA_BACKEND_TOPICS: Topic[] = [
  // ── DATA ENGINEERING ────────────────────────────────────────────────
  {
    id: "three-layer-architecture",
    title: "Three-Layer Immutable Data Architecture",
    domain: "data",
    difficulty: "beginner",
    status: "ready",
    tagline: "raw is truth, derived is disposable, app is human",
    analogy:
      "Think of a courthouse. The raw layer is the evidence locker — nothing is ever altered, every item is tagged with who brought it in and when. The derived layer is the case summary a clerk rewrites from evidence whenever needed — throw it away, rebuild it, nothing is lost. The app layer is the judge's handwritten notes — human judgment that must survive even when summaries are rewritten.",
    problem:
      "The billing software has no API. Staff export CSVs by hand — files arrive late, duplicated, malformed, re-exported with corrections. If you clean data in place, every bug in your cleaning code permanently corrupts your only copy of history. You need a design where mistakes in analytics code are always recoverable.",
    withoutIt:
      "One bad UPDATE during cleanup and the original numbers are gone forever. You can never answer 'what did the export actually say?' Debugging becomes archaeology without artifacts.",
    prereqs: [],
    unlocks: ["idempotent-rebuilds", "sql-window-functions", "basket-analysis"],
    level1: [
      "AxonFlux splits Postgres into three schemas with different rules. raw.* is append-only: every ingested row keeps its import_batch_id (which file run it came from) and source_file_name. Nothing is ever updated or deleted there.",
      "derived.* holds analytics tables — daily metrics, health signals, stock positions. The entire schema is TRUNCATEd and rebuilt from raw.* on every pipeline run. It is a pure function of the raw layer: derived = f(raw).",
      "app.* holds what humans typed — users, canonical product names, cash counts, pamphlets. It is managed by Alembic migrations and must survive rebuilds, because you cannot recompute a human's judgment.",
    ],
    level2: [
      {
        heading: "Why immutability is the load-bearing decision",
        body: "Because derived is a pure function of raw, any bug in analytics SQL is fixed by editing SQL and re-running — history is never at risk. This is the same idea as event sourcing (the log is truth, views are projections) and the data-warehouse bronze/silver/gold pattern, applied at supermarket scale. Auditability falls out for free: any number on the dashboard traces to source_file_name + import_batch_id.",
      },
      {
        heading: "The join contract between app and derived",
        body: "app.* must never replace derived data, only enrich it: COALESCE(p.canonical_name, d.product_name). If a human renamed the product, use their name; otherwise fall back to the raw-derived one. This one COALESCE pattern is why rebuilds can't orphan human work — the join is by stable key (barcode), not by row identity, so rebuilt rows re-attach automatically.",
      },
      {
        heading: "Dedup at the boundary",
        body: "Files get re-exported. SHA-256 of file bytes gates ingestion (same file twice = no-op), and row-level dedup triggers protect raw tables on top. Idempotent ingestion means staff can be sloppy and the system stays correct — designing for operator error is a production skill.",
      },
    ],
    level3: [
      {
        heading: "Failure modes and their blast radius",
        body: "Bug in ingestion → bad rows in raw, permanently. Mitigation: keep ingestion dumb (map columns, store text as-is) and push ALL interpretation (date parsing, mobile normalization) into derived SQL where it's re-runnable. This is why the infamous 'DD-MM-YYYYHH12:MI AM' date bug is fixed in derived SQL, not at ingestion. Bug in derived SQL → wrong dashboards until next rebuild; blast radius = zero data loss. Bug in app writes → real damage possible; hence Alembic migrations and the smallest possible write surface.",
      },
      {
        heading: "Trade-offs you accepted",
        body: "Full rebuild is O(all history) — ~2.3M rows today, fine; at 100M rows you'd need incremental models (this is exactly what dbt incremental materializations solve). TRUNCATE means a window where dashboards are empty mid-rebuild; acceptable for one store, unacceptable for a SaaS — the fix there is blue/green table swaps (build into _next, atomic RENAME). Storage is 'wasted' keeping raw forever — but raw text compresses well and is your only insurance policy.",
      },
      {
        heading: "Interview framing",
        body: "This is a lakehouse medallion architecture in miniature: raw=bronze, derived=silver/gold, app=operational store. Saying 'I chose rebuildability over incremental complexity at my scale, and here is the exact scale where that flips' is a senior answer.",
      },
    ],
    axonflux:
      "sql/raw_tables.sql defines the append-only layer; sql/rebuild_derived/ (steps 00–10) rebuilds analytics; api/migrations/ manages app.*. The weekly pipeline orchestrates truncate → rebuild → export.",
    companies:
      "Databricks popularized medallion (bronze/silver/gold). Every dbt shop treats models as rebuildable pure functions of sources. Banks keep append-only ledgers for the same auditability reason.",
    whenNot:
      "True streaming needs (sub-second freshness) or petabyte history make full rebuilds impossible — you'd move to incremental/streaming materialization (Kafka + Flink, dbt incremental, Materialize). Don't cargo-cult three schemas into a CRUD app with no analytics — a normal normalized schema is fine there.",
    files: [
      { path: "sql/raw_tables.sql", note: "append-only tables + ingestion_batches audit" },
      { path: "sql/rebuild_derived/00_daily_sales_summary.sql", note: "first rebuild step — date-spine anchor" },
      { path: "pipelines/weekly_pipeline.py", note: "orchestrates the rebuild" },
      { path: "CLAUDE.md", note: "the COALESCE join contract, documented" },
    ],
    interview: [
      {
        q: "Why rebuild derived tables from scratch instead of updating them incrementally?",
        a: "Correctness by construction: derived = f(raw) means no drift, no partial-update bugs, and any SQL fix heals history on next run. Incremental updates require change tracking and merge logic — real complexity that only pays off when rebuild time exceeds the freshness requirement. At 2.3M rows a rebuild is minutes; I documented the scale at which I'd switch to incremental models and blue/green swaps.",
      },
      {
        q: "How do you guarantee human edits survive a rebuild?",
        a: "Human data never lives in derived. It lives in app.*, joined at read time by stable business key (barcode) with COALESCE(app override, derived value). Rebuilds recreate derived rows; the join re-attaches app data automatically because it's keyed by barcode, not row id.",
      },
      {
        q: "A dashboard number looks wrong. Walk me through debugging it.",
        a: "Trace down the layers: dashboard API → derived table → the rebuild SQL step that wrote it → raw rows via import_batch_id → the actual source file. Because raw is immutable, the file's content is still exactly what was ingested — the answer is always reachable.",
      },
    ],
    mentor: {
      deep: [
        "Why derived must be a pure function of raw — this is THE design idea",
        "The COALESCE enrichment contract and why joins use business keys",
        "Where interpretation belongs (derived) vs storage (raw)",
      ],
      abstract: ["Postgres schema mechanics", "pandas chunked-insert details in ingest_core"],
      mistakes: [
        "Storing computed state in app.* 'temporarily' — it rots",
        "Fixing bad data with UPDATE on raw 'just this once' — breaks the whole guarantee",
        "Putting parsing logic in ingestion where it can't be re-run",
      ],
    },
    exercises: [
      "Delete derived.* locally, re-run the pipeline, verify dashboards return byte-identical numbers.",
      "Write the blue/green variant of one rebuild step (build into _next table, atomic swap) and measure downtime difference.",
      "Pick one dashboard KPI and trace it to a source file name on paper.",
    ],
    pos: { x: 14, y: 8 },
  },
  {
    id: "idempotent-rebuilds",
    title: "Idempotency & Deterministic Pipelines",
    domain: "data",
    difficulty: "intermediate",
    status: "ready",
    tagline: "run it twice, nothing changes",
    analogy:
      "An elevator button. Pressing it five times doesn't summon five elevators — the system converges to the same state no matter how many times you fire the same request. Idempotent operations are elevator buttons; non-idempotent ones are cash registers where every press charges the card again.",
    problem:
      "Real operations are messy: files re-exported, scripts re-run after a crash, buttons double-clicked. If re-running work duplicates or corrupts state, every retry becomes dangerous — and retries are how all distributed systems recover.",
    withoutIt:
      "Re-ingesting a file doubles revenue numbers. A crashed pipeline leaves half-built tables you're afraid to touch. Every operation needs a human to check 'did it already run?' — the system can't heal itself.",
    prereqs: ["three-layer-architecture"],
    unlocks: ["background-workers", "event-driven-outbox"],
    level1: [
      "An operation is idempotent when doing it N times equals doing it once. AxonFlux leans on this everywhere: file SHA-256 dedup makes ingestion idempotent (same file → skip), TRUNCATE-then-rebuild makes the derived pipeline idempotent (state after run does not depend on state before), and raw dedup triggers make row inserts idempotent.",
      "Determinism is the sibling property: same inputs → same outputs. Because rebuild SQL has no randomness and no dependence on run time (except CURRENT_DATE for the date spine), two runs on the same raw data produce identical derived tables.",
    ],
    level2: [
      {
        heading: "Three techniques, one goal",
        body: "1) Natural keys + dedup: SHA-256 of file bytes is a content-derived identity — same content can't enter twice. 2) Truncate-and-rebuild: instead of computing a delta against unknown current state, erase and recompute from truth — idempotency by construction. 3) Idempotency keys: when you can't erase (payments, emails), attach a caller-supplied key and refuse duplicates — Stripe's API pattern. AxonFlux uses 1 and 2; you'll need 3 when the pipeline moves behind a job queue.",
      },
      {
        heading: "The one non-idempotent gap today",
        body: "POST /api/pipeline/trigger spawns a subprocess with no lock. Two clicks = two rebuilds racing on TRUNCATE — the second can truncate tables the first is filling. This is the concrete motivation for Phase 1's job queue with a concurrency guard (single-flight lock): making the *trigger* idempotent, not just the work.",
      },
    ],
    level3: [
      {
        heading: "Idempotency under partial failure",
        body: "The hard case isn't running twice — it's crashing halfway. TRUNCATE+rebuild inside implicit transactions per step means a crash leaves some steps rebuilt, some stale — consistent-enough for analytics, but the ordering contract (step 00 before 01, because 01 anchors on 00's MIN date) means partial state can silently shift the date spine. Production-grade version: wrap the whole rebuild in one transaction (Postgres DDL is transactional!) or build into shadow tables and swap atomically. Knowing that Postgres can TRUNCATE and rebuild inside a single transaction — and most engineers don't know DDL is transactional in PG — is a genuine interview differentiator.",
      },
      {
        heading: "At-least-once world",
        body: "Queues, webhooks, and retries all deliver at-least-once; exactly-once delivery is a myth — what exists is at-least-once delivery + idempotent processing = effectively-once outcome. This sentence is the foundation for the outbox pattern, background workers, and every event-driven system you'll build next.",
      },
    ],
    axonflux:
      "SHA-256 file gate in ingestion, dedup triggers (scripts/setup_raw_triggers.py), truncate-rebuild in sql/rebuild_derived/, and the documented step-ordering contract (00 anchors 01's date spine).",
    companies:
      "Stripe's Idempotency-Key header is the canonical API example. Airflow/dbt communities treat idempotent tasks as table stakes — any task must be safely re-runnable after a crash.",
    whenNot:
      "Operations that are inherently once-only (sending an SMS) can't be made idempotent at the operation level — you make the *record* of sending idempotent instead and accept rare duplicates or use provider dedup windows.",
    files: [
      { path: "raw_ingestion/common/ingest_core.py", note: "SHA-256 gate + batch tracking (read-only reference)" },
      { path: "scripts/setup_raw_triggers.py", note: "row-level dedup triggers" },
      { path: "api/routers/pipeline.py", note: "the non-idempotent trigger — Phase 1 fixes this" },
    ],
    interview: [
      {
        q: "Your pipeline crashed at step 4 of 10. What state is the database in, and is it safe to re-run?",
        a: "Steps 0–3 rebuilt, 4 partial or empty, 5–10 stale from last run. Safe to re-run because every step truncates before writing — the rerun converges to correct state. The residual risk is readers seeing mixed-generation data during the window; the fix is shadow tables + atomic swap or one wrapping transaction, since Postgres DDL is transactional.",
      },
      {
        q: "How would you make a 'charge customer' endpoint safe to retry?",
        a: "Idempotency key: client generates a key per logical charge, server stores key→result and replays the stored result on duplicates. Truncate-rebuild doesn't apply — you can't un-charge — so you shift idempotency from the operation to its ledger.",
      },
    ],
    mentor: {
      deep: [
        "at-least-once delivery + idempotent consumer = effectively once — internalize this equation",
        "Why truncate-rebuild is idempotency by construction",
      ],
      abstract: ["Trigger PL/pgSQL syntax", "SHA-256 internals"],
      mistakes: [
        "Believing a framework gives you exactly-once delivery",
        "Making the happy path idempotent but not the crash path",
        "Checking 'does row exist' without a unique constraint — race condition; the constraint IS the idempotency",
      ],
    },
    exercises: [
      "Kill the pipeline mid-run (step 03), inspect which derived tables are stale vs fresh, then re-run and verify convergence.",
      "Add a Postgres advisory lock to the pipeline so two concurrent runs are impossible; prove it with two terminals.",
      "Design the idempotency-key table for the future job queue: columns, unique constraint, retention.",
    ],
    pos: { x: 10, y: 30 },
  },
  {
    id: "sql-window-functions",
    title: "Window Functions & Time-Series SQL",
    domain: "data",
    difficulty: "intermediate",
    status: "ready",
    tagline: "per-row answers that see the whole neighborhood",
    analogy:
      "A student's rank in class. To compute one student's rank you must see everyone's marks — but the answer belongs to each student individually. GROUP BY collapses the class into one summary row; a window function lets every row peek at its 'window' of neighbors while remaining its own row.",
    problem:
      "Analytics questions are relative: 'how does today compare to the 7-day average?', 'what is cumulative stock as of this date?'. Plain SQL sees one row at a time; GROUP BY destroys row identity. You need per-row computations over ordered neighborhoods.",
    withoutIt:
      "You'd drag millions of rows into pandas to compute lags and rolling means — slow, memory-hungry, and a second codebase to keep correct. The 12x view→table lesson came from exactly this class of heavy computation.",
    prereqs: ["three-layer-architecture"],
    unlocks: ["postgres-optimization", "demand-forecasting"],
    level1: [
      "A window function computes over a set of rows related to the current row: AVG(qty) OVER (PARTITION BY barcode ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) is a 7-day rolling average — per product, per day, without collapsing rows.",
      "AxonFlux's feature layer is built from these: lag_1 and lag_7 (LAG), rolling 7/30/60-day averages and stddev, and cumulative pseudo-stock (SUM ... OVER ordered by date = running total of purchases minus sales).",
    ],
    level2: [
      {
        heading: "The mental model: partition, order, frame",
        body: "PARTITION BY = which rows form the group (one product's history). ORDER BY = how they're sequenced (by date). Frame (ROWS BETWEEN ...) = which slice of the ordered partition this row may see. Rolling average = trailing frame; running total = UNBOUNDED PRECEDING to CURRENT ROW; LAG = a frame of exactly one prior row. Every window expression is these three dials.",
      },
      {
        heading: "The date spine — why dense series matter",
        body: "Products don't sell every day, but LAG/rolling frames assume one row per day — a missing day silently turns a 7-row frame into '7 sparse observations spanning 3 weeks'. Step 01 cross-joins a generated calendar with products and fills zeros: ~2.3M rows of deliberate redundancy so every window is honest. Dense-then-window is the standard time-series pattern; ML features (B1) inherit correctness from it.",
      },
      {
        heading: "Pseudo-stock as cumulative flow",
        body: "No stock-count exports exist, so stock is reconstructed: running_purchases − running_sales per product, both as window sums over the dense spine. It drifts from physical reality (theft, damage) but is directionally correct and fully rebuildable — a deterministic estimate beats a missing number.",
      },
    ],
    level3: [
      {
        heading: "Execution cost and the frame trap",
        body: "Windows require sorting each partition — O(n log n) per partition — and Postgres materializes sort state in work_mem, spilling to disk beyond it. ROWS vs RANGE matters: RANGE with peers can degrade to quadratic on ties; ROWS is what you almost always mean for time series. Multiple windows with identical PARTITION/ORDER share one sort — write them to match. This is why step 02 computes all lags and rolls in one pass.",
      },
      {
        heading: "When windows lose to specialized stores",
        body: "At billions of rows, per-query window sorts become the bottleneck; column stores (ClickHouse, DuckDB) or pre-aggregated increments win. Your rebuild-time materialization is the middle path: pay the window cost once per week, serve reads from plain tables.",
      },
    ],
    axonflux:
      "sql/rebuild_derived/01 builds the dense spine, 02 computes lag/rolling features, 04 computes cumulative stock position — the ML feature store is literally window functions materialized.",
    companies:
      "Every analytics team lives on these; dbt models are full of them. Feature stores (Feast, Tecton) productionize exactly 'rolling aggregates per entity' — you hand-rolled the core idea.",
    whenNot:
      "Sub-second leaderboards over hot data (use incremental counters/Redis sorted sets), or truly massive scans (column store). Also don't window when a plain GROUP BY answers the question — collapsing is cheaper than neighboring.",
    files: [
      { path: "sql/rebuild_derived/01_product_daily_metrics.sql", note: "date spine × products, zero-fill" },
      { path: "sql/rebuild_derived/02_product_daily_features.sql", note: "LAG + rolling 7/30/60 + stddev" },
      { path: "sql/rebuild_derived/04_product_stock_position.sql", note: "cumulative pseudo-stock" },
    ],
    interview: [
      {
        q: "Explain PARTITION BY vs GROUP BY.",
        a: "GROUP BY collapses each group to one output row; PARTITION BY defines a per-row visibility set while preserving every row. Rank-in-class: GROUP BY gives class averages, PARTITION BY gives each student their rank.",
      },
      {
        q: "Why did you densify to 2.3M rows instead of keeping sparse sales rows?",
        a: "Window frames count rows, not days. Sparse data makes 'last 7 rows' mean 'last 7 sale-days', biasing rolling stats and lags. Zero-filled spine makes frames time-honest; the storage cost is trivial next to the correctness win, and downstream ML features inherit it.",
      },
      {
        q: "Your rolling average step got slow. First three things you look at?",
        a: "(1) EXPLAIN ANALYZE for sort spills — is work_mem overflowing to disk; (2) whether all window expressions share one PARTITION/ORDER so one sort serves all; (3) ROWS vs RANGE frames — RANGE with many ties degrades badly.",
      },
    ],
    mentor: {
      deep: [
        "partition / order / frame as three independent dials",
        "Why dense date spines precede any time-series feature",
        "Running totals as flow-integration (stock = ∫(in − out))",
      ],
      abstract: ["Postgres sort-node internals", "exact spill thresholds"],
      mistakes: [
        "ROWS/RANGE confusion on tied timestamps",
        "Rolling stats over sparse series and trusting them",
        "Recomputing identical sorts by varying ORDER BY slightly across expressions",
      ],
    },
    exercises: [
      "Write day-over-day revenue delta and 7-day z-score for one product by hand, then diff against derived.product_daily_features.",
      "EXPLAIN ANALYZE step 02; find the sort node, note work_mem spill, double work_mem locally, re-measure.",
      "Rebuild pseudo-stock for one barcode in a spreadsheet from raw purchases/sales; explain any drift vs step 04.",
    ],
    pos: { x: 18, y: 50 },
  },
  {
    id: "postgres-optimization",
    title: "PostgreSQL Performance & EXPLAIN",
    domain: "data",
    difficulty: "intermediate",
    status: "ready",
    tagline: "read the planner's mind before overruling it",
    analogy:
      "A GPS with traffic data. The query planner picks a route (index scan vs full scan, hash join vs nested loop) using statistics about your data's 'traffic'. EXPLAIN shows the chosen route; EXPLAIN ANALYZE drives it with a stopwatch. Optimization is not 'add an index' — it's understanding why the GPS chose the slow road.",
    problem:
      "The dashboard hit product_dimension as a VIEW wrapping heavy CTEs — every page load recomputed the whole thing: ~700ms. Users feel anything over ~100ms. You need to know where time goes and what the planner can and cannot do for you.",
    withoutIt:
      "You guess: add random indexes (write cost, no read benefit), cache prematurely, or blame the ORM. Performance work without EXPLAIN is astrology.",
    prereqs: ["sql-window-functions"],
    unlocks: ["caching-redis", "vector-search"],
    level1: [
      "EXPLAIN shows the plan tree: scans at leaves, joins/aggregates above. EXPLAIN ANALYZE runs it and reports actual rows and ms per node. The bug is usually where 'estimated rows' and 'actual rows' diverge wildly — bad stats mislead the planner.",
      "AxonFlux's biggest win wasn't an index: converting product_dimension from VIEW to TABLE moved computation from query-time to rebuild-time — 700ms → 55ms (12x). The pipeline's truncate-rebuild made materialization free: it's rebuilt anyway.",
    ],
    level2: [
      {
        heading: "The materialization spectrum",
        body: "VIEW = recompute every read. MATERIALIZED VIEW = snapshot + manual refresh. TABLE rebuilt by pipeline = snapshot refreshed on your schedule, with full control. Because derived.* is already rebuild-on-demand, plain tables dominate here — the 'derived view vs table' memory rule exists because this lesson was paid for once. Trade: staleness between rebuilds, which the weekly cadence already accepts.",
      },
      {
        heading: "Indexes are sorted phone books, and they're not free",
        body: "B-tree = ordered copy of chosen columns; O(log n) lookups, but every INSERT pays maintenance. Truncate-rebuild flips the usual calculus: derived tables are write-once-read-many per cycle, so index generously — but create indexes AFTER bulk load (build once on full data) not before (maintain per row). Partial indexes (WHERE is_dead_stock) and composite order (equality columns first, range last) are the two tools that matter most here.",
      },
      {
        heading: "Statistics drive everything",
        body: "The planner estimates row counts from sampled stats (ANALYZE). After a rebuild that replaced all rows, stale stats can make it pick nested loops over hash joins on millions of rows. Rule: end the pipeline with ANALYZE on derived tables. Cheap, boring, frequently the entire fix.",
      },
    ],
    level3: [
      {
        heading: "Reading a plan like a pro",
        body: "Work bottom-up. Red flags: Seq Scan on big table under a tight filter (missing/unusable index — check function-wrapped columns), estimated=1 actual=500k (stale stats or correlated predicates), Sort Method: external merge (work_mem spill), Nested Loop with inner Seq Scan (catastrophic on size). Buffers option shows shared hit vs read — cache hit ratio in disguise.",
      },
      {
        heading: "At what scale each tool appears",
        body: "Under ~10M rows: indexes + materialization + ANALYZE cover almost everything (you are here). 10M–1B: partitioning by date (drop old partitions instead of DELETE; partition pruning in scans), BRIN indexes on natural date ordering. Beyond, or for scan-heavy aggregates: column stores. Partitioning product_daily_metrics by month is your natural next exercise — the table is date-spined by construction.",
      },
    ],
    axonflux:
      "05_necessary_views.sql holds the view→table conversion; rebuild steps create indexes post-load; the 700→55ms optimization is documented in memory and docs/.",
    companies:
      "Every Postgres-backed product team lives in EXPLAIN (Instagram's early scaling, GitLab's public runbooks). 'pg is the default until proven otherwise' is 2026 industry consensus.",
    whenNot:
      "Don't optimize queries the product doesn't feel — 700ms in a nightly job is free; the same in a dashboard read is an outage of attention. And don't reach for caching (Redis) before the query itself is sane — cache hides, never fixes.",
    files: [
      { path: "sql/rebuild_derived/05_necessary_views.sql", note: "view→table 12x lesson lives here" },
      { path: "sql/rebuild_derived/01_product_daily_metrics.sql", note: "the 2.3M-row table — partitioning candidate" },
    ],
    interview: [
      {
        q: "Walk me through diagnosing a slow endpoint backed by Postgres.",
        a: "Measure first: which query, via pg_stat_statements or app timing. EXPLAIN (ANALYZE, BUFFERS) it. Compare estimated vs actual rows per node; find the dominant-cost node. Then the fix menu in order: stats (ANALYZE), index that matches the predicate shape, rewrite (avoid function-on-column), materialize computation, and only then cache.",
      },
      {
        q: "You converted a view to a table and got 12x. Why not a materialized view?",
        a: "MATERIALIZED VIEW needs its own REFRESH lifecycle. My pipeline already truncate-rebuilds the schema on a schedule — a plain table materialized during rebuild gets identical read performance with zero new moving parts, and stays consistent with every other derived table's freshness.",
      },
      {
        q: "When would you partition, and by what key?",
        a: "When bloat management or pruning matters: product_daily_metrics by month — queries filter recent windows so partition pruning skips history, and retention becomes DROP PARTITION instead of DELETE. Not before ~10M+ rows; partitions add planning overhead and constraint discipline.",
      },
    ],
    mentor: {
      deep: [
        "estimated-vs-actual as the primary debugging signal",
        "The materialization spectrum and where rebuild-time compute wins",
        "Index cost model: reads pay less because writes paid more",
      ],
      abstract: ["Planner cost-constant tuning", "vacuum internals (until you have write-heavy tables)"],
      mistakes: [
        "Indexing every column 'to be safe'",
        "Reaching for Redis before EXPLAIN",
        "Forgetting ANALYZE after bulk loads — the classic silent killer",
        "Testing on 100 rows and extrapolating — planners change strategy with size",
      ],
    },
    exercises: [
      "EXPLAIN (ANALYZE, BUFFERS) the three heaviest dashboard queries; write one paragraph per plan naming the dominant node.",
      "Add ANALYZE to the pipeline's final step; measure whether any dashboard query plan changes.",
      "Prototype partitioning product_daily_metrics by month in a scratch schema; show partition pruning in a plan.",
    ],
    pos: { x: 14, y: 72 },
  },

  // ── BACKEND ─────────────────────────────────────────────────────────
  {
    id: "jwt-auth",
    title: "JWT Authentication",
    domain: "backend",
    difficulty: "beginner",
    status: "ready",
    tagline: "a tamper-proof visitor badge, not a session",
    analogy:
      "A festival wristband. At the gate (login) they check your ID once and clamp on a wristband with your access level printed on it. Every stall trusts the wristband without calling the gate — it's tamper-evident (the signature), it expires, and crucially: the gate keeps no list of who's inside. Cut-off wristbands still 'work' until they expire — that's the revocation problem.",
    problem:
      "HTTP is stateless — every request is a stranger. Server-side sessions fix this with a lookup table, but then every request pays a DB hit and horizontal scaling needs shared session storage. You want requests to carry their own proof.",
    withoutIt:
      "Either no auth, or session state: sticky load balancers, session-store outages logging everyone out, and a DB roundtrip per request just to know who's asking.",
    prereqs: [],
    unlocks: ["rbac", "mcp"],
    level1: [
      "A JWT is three base64url parts: header.payload.signature. Payload holds claims (sub=username, role, exp). Signature = HMAC-SHA256(header.payload, SECRET_KEY) — anyone can READ the payload (it's only encoded, not encrypted), nobody can MODIFY it without the key.",
      "AxonFlux flow: POST /login verifies bcrypt-hashed password → issues signed token with user_id/username/role → Next.js stores it → every request sends Authorization: Bearer → get_current_user decodes, verifies signature+expiry, and returns a CurrentUser without touching the database.",
    ],
    level2: [
      {
        heading: "Stateless verification is the entire point",
        body: "decode_access_token needs only SECRET_KEY — no user-table read. That's why role lives in the payload: authorization decisions become pure token inspection. The cost: claims are a snapshot at login. Change a user's role and their old token keeps the old role until expiry — consistency traded for statelessness.",
      },
      {
        heading: "bcrypt, deliberately slow",
        body: "Password hashing must be slow (bcrypt's work factor) so offline brute-force on a leaked table is expensive. Never fast hashes (SHA-256) for passwords; salt is built into bcrypt so identical passwords hash differently. This is the one part of auth code you never hand-roll beyond calling the library.",
      },
      {
        heading: "Where tokens live in the browser",
        body: "AxonFlux keeps the token in localStorage: simple, works with Bearer headers, but readable by any XSS payload. The alternative — httpOnly cookies — is XSS-immune but reintroduces CSRF concerns and complicates non-browser clients. For an internal LAN tool, localStorage is a defensible trade-off; for a public product, httpOnly + SameSite is the standard answer. Know both positions.",
      },
    ],
    level3: [
      {
        heading: "The revocation problem and its ladder",
        body: "Stateless means un-revokable until expiry. Mitigation ladder: (1) short expiry — blunt, annoying; (2) refresh tokens — short-lived access token + long-lived refresh token stored server-side, so revocation = delete refresh token, damage window = access-token TTL; (3) denylist of revoked jti claims in Redis — reintroduces a per-request lookup but only for the rare revoked set. Production systems typically run (2)+(3). AxonFlux runs (1) alone today — a known, documented gap, acceptable on a LAN with trusted staff.",
      },
      {
        heading: "Algorithm confusion & key discipline",
        body: "Classic JWT attacks: alg=none acceptance, and RS256→HS256 confusion where an attacker signs with the public key as HMAC secret. Defense: pin the algorithm server-side (never trust the header's alg), keep SECRET_KEY high-entropy and out of git (.env), rotate on suspicion. python-jose pins via algorithms=[...] — verify this stays explicit.",
      },
    ],
    axonflux:
      "api/core/security.py (hash/verify, encode/decode), api/routers/auth.py (login), api/dependencies.py:get_current_user (per-request verification), web/lib/auth.ts (storage + header injection).",
    companies:
      "Auth0/Clerk/Firebase issue JWTs; AWS API Gateway and every microservice mesh verify them at the edge precisely because verification needs no shared state.",
    whenNot:
      "Instant-revocation requirements (banking sessions), or payloads that must stay secret (JWT is readable!). Server-rendered monoliths with one app server lose little with plain sessions — statelessness buys nothing there.",
    files: [
      { path: "api/core/security.py", note: "bcrypt + JWT encode/decode" },
      { path: "api/routers/auth.py", note: "login endpoint" },
      { path: "api/dependencies.py", note: "get_current_user — signature+expiry check per request" },
      { path: "web/lib/auth.ts", note: "client storage + getToken" },
    ],
    interview: [
      {
        q: "JWT vs server-side sessions — when each?",
        a: "JWT: stateless verification, horizontal scale, cross-service auth — cost is delayed revocation and claims staleness. Sessions: instant revocation, nothing sensitive on the client — cost is shared session store and per-request lookup. Rule of thumb: distributed/API-first → JWT with refresh tokens; single monolith with instant-logout needs → sessions.",
      },
      {
        q: "A staff member is fired. Their token is valid for 12 more hours. What do you do?",
        a: "Today: rotate SECRET_KEY — nukes every session, acceptable for a small team emergency. Properly: refresh-token architecture so access tokens live minutes, plus a Redis denylist keyed by jti for immediate kills. I'd present the trade-off ladder rather than pretend stateless tokens revoke cleanly.",
      },
      {
        q: "Why is the role inside the token, and what risk does that create?",
        a: "So authorization is a pure token check — no DB read per request. Risk: role changes don't propagate until re-login, and the payload is client-readable so nothing secret may live there. Signature prevents tampering — a user cannot promote themselves to admin without the server key.",
      },
    ],
    mentor: {
      deep: [
        "Signed ≠ encrypted — payload is public, integrity is protected",
        "The statelessness↔revocation trade-off ladder",
        "Why bcrypt must be slow",
      ],
      abstract: ["HMAC math", "base64url mechanics", "python-jose internals"],
      mistakes: [
        "Secrets in the payload",
        "Verifying without pinning the algorithm",
        "Long-lived access tokens with no refresh strategy",
        "Rolling your own password hashing",
      ],
    },
    exercises: [
      "Paste one of your tokens into jwt.io; identify every claim and confirm what an attacker could read.",
      "Flip one payload byte and replay it against the API; watch signature verification reject it.",
      "Design (on paper) the refresh-token flow for AxonFlux: tables, endpoints, TTLs, and the fired-employee scenario.",
    ],
    pos: { x: 36, y: 8 },
  },
  {
    id: "rbac",
    title: "Role-Based Access Control",
    domain: "backend",
    difficulty: "beginner",
    status: "ready",
    tagline: "authorization is a policy, not an if-statement scattered 40 times",
    analogy:
      "Hospital ID badges. A nurse's badge opens wards, a surgeon's opens theatres, admin opens the pharmacy records. Doors don't know names — they know roles. Hiring means issuing a badge, not reprogramming every door. And the moment someone asks 'this one surgeon, only on Tuesdays', you've outgrown badges — that's attribute-based control.",
    problem:
      "AxonFlux has three kinds of humans: counter staff (submit cash counts, build pamphlets), the store manager (verify closures, approve agent outputs), and the developer/admin (everything). Authentication says who you are; nothing yet says what you may do.",
    withoutIt:
      "Every endpoint invents its own check, or worse, trusts the frontend to hide buttons. Hidden button ≠ closed endpoint — anyone with the API docs and a staff token can call the manager's verify endpoint.",
    prereqs: ["jwt-auth"],
    unlocks: ["mcp"],
    level1: [
      "RBAC maps users→roles and roles→permissions, then guards resources by role. AxonFlux encodes role in the JWT and enforces via FastAPI dependencies: require_admin exists; A4 adds manager to the users.role CHECK constraint, a require_manager dependency, and an audit pass over every tool endpoint.",
      "The three-role matrix: staff = submit closure, pamphlets, BOM review, trigger pipeline. manager = staff + verify closures + approve agent/blog outputs. admin = everything + config + API keys.",
    ],
    level2: [
      {
        heading: "Enforcement lives at the dependency layer",
        body: "def require_manager(user = Depends(get_current_user)): raise 403 unless role in {'manager','admin'}. Declared per-route, the policy is visible in the signature, testable in isolation, and impossible to forget silently — a route without a guard is greppable. Frontend show/hide via JWT role is UX only; the server check is the security boundary. Never confuse the two.",
      },
      {
        heading: "Roles as a lattice, not an enum",
        body: "admin ⊃ manager ⊃ staff. Encode the hierarchy once (ROLE_LEVEL = {staff:0, manager:1, admin:2}; require level ≥ N) instead of listing allowed roles per endpoint — adding a role later means one table edit, not forty endpoint edits. This tiny design choice is the difference between RBAC and if-statement sprawl.",
      },
      {
        heading: "401 vs 403 — precise failure semantics",
        body: "401 Unauthorized = 'I don't know who you are' (missing/invalid token). 403 Forbidden = 'I know you, and no' (valid token, insufficient role). Mixing them breaks clients (which redirect to login on 401) and confuses debugging.",
      },
    ],
    level3: [
      {
        heading: "Beyond RBAC: the ABAC boundary",
        body: "RBAC breaks when rules mention attributes: 'staff can edit their own closure, before manager verification'. Role alone can't express ownership or state. That's ABAC — policy over (subject, action, resource, context). Full policy engines (OPA, Cerbos) externalize this; overkill here, but the vocabulary matters: AxonFlux's 'staff edit own draft closure' rule is an ABAC rule implemented as an inline ownership check next to a role check. Naming it correctly in interviews signals you know where RBAC's cliff is.",
      },
      {
        heading: "Machine callers don't get roles",
        body: "Phase E's MCP server authenticates Manastra with an API key, not a JWT — machines don't log in with passwords. Scoped key (read-only, no PII endpoints) checked by a separate dependency. Two auth planes — human JWT, machine API key — with distinct lifecycles, rotation stories, and blast radii is exactly how production platforms separate concerns.",
      },
    ],
    axonflux:
      "api/dependencies.py holds require_admin (require_manager lands in A4); tool manifests carry required_role for sidebar gating; migration adds 'manager' to the role CHECK constraint.",
    companies:
      "AWS IAM (roles+policies at planetary scale), GitHub org roles, Stripe's team permissions. Kubernetes RBAC guards every cluster API call with exactly this dependency-style model.",
    whenNot:
      "Two-user internal scripts don't need role systems. And once rules reference resource attributes heavily (ownership, tenancy, time), stretching RBAC with role explosion (staff_who_can_edit_tuesday) is the anti-pattern — switch vocabulary to ABAC.",
    files: [
      { path: "api/dependencies.py", note: "require_admin; A4 adds require_manager + level lattice" },
      { path: "api/migrations/versions/001_create_app_schema.py", note: "users.role CHECK constraint" },
      { path: "api/tools/__init__.py", note: "manifest required_role — UI gating, not security" },
    ],
    interview: [
      {
        q: "Where do you enforce authorization, and why not in the frontend?",
        a: "Server-side, per-route, via FastAPI dependencies — the route signature declares its policy. Frontend role checks are UX (hide what you can't use); the API is the boundary because any client can craft requests. Hidden ≠ forbidden.",
      },
      {
        q: "How would you add a fourth role without touching forty endpoints?",
        a: "Because guards compare against a role hierarchy (level ≥ threshold), a new role is one entry in the lattice plus a migration extending the CHECK constraint. Endpoints declaring require_manager never change. If I'd hardcoded role lists per endpoint, this would be a forty-file diff — that's the design's payoff.",
      },
      {
        q: "Staff should edit only their own unverified cash closure. Is that RBAC?",
        a: "No — that's an attribute rule (ownership + resource state), i.e., ABAC. I implement it as an explicit ownership-and-status check alongside the role guard, and I'd reach for a policy engine only when such rules multiply across resources.",
      },
    ],
    mentor: {
      deep: [
        "Dependency-level enforcement as declarative, greppable policy",
        "Role lattice vs role list — the extensibility hinge",
        "RBAC's boundary with ABAC (ownership/state rules)",
      ],
      abstract: ["OPA/Cerbos internals until rules multiply"],
      mistakes: [
        "Trusting UI hiding as security",
        "401/403 conflation",
        "Role explosion instead of admitting a rule is attribute-based",
        "Forgetting machine callers need a separate auth plane",
      ],
    },
    exercises: [
      "Implement require_manager with the level-lattice pattern and write 6 pytest cases (3 roles × allowed/forbidden endpoints).",
      "Audit every tool router: table of endpoint → current guard → correct guard. Find at least one gap.",
      "Write the ownership check for 'staff edits own draft closure' and explain in a comment why it isn't pure RBAC.",
    ],
    pos: { x: 42, y: 24 },
  },
  {
    id: "dependency-injection",
    title: "Dependency Injection (FastAPI Depends)",
    domain: "backend",
    difficulty: "beginner",
    status: "ready",
    tagline: "ask for what you need, don't build it yourself",
    analogy:
      "A restaurant kitchen. The chef doesn't grow vegetables or forge knives — ingredients and tools arrive at the station, prepared. The chef declares what the dish needs; the kitchen supplies it. Swap the vegetable supplier and no recipe changes. Testing = handing the chef plastic vegetables without them caring.",
    problem:
      "Route handlers need things with lifecycles: DB sessions that must commit-or-rollback-then-close, the authenticated user, config. If every handler constructs these itself, you get duplicated setup/teardown, untestable coupling, and forgotten cleanup leaking connections.",
    withoutIt:
      "Sessions created ad-hoc leak on exceptions; auth checks copy-pasted drift apart; tests must monkeypatch module globals instead of substituting a fake.",
    prereqs: [],
    unlocks: ["plugin-architecture"],
    level1: [
      "FastAPI's Depends() inverts control: def endpoint(db: Session = Depends(get_db), user = Depends(get_current_user)) declares needs; the framework resolves, injects, and tears down per request.",
      "AxonFlux's two DB dependencies encode the architecture: get_db() yields an ORM session (commit/rollback/close via try/finally) for app.* writes; get_conn() yields a raw connection for derived/raw reads. The type you inject documents which layer you're touching — DI as architectural signage.",
    ],
    level2: [
      {
        heading: "Generator dependencies = scoped resources",
        body: "yield-style dependencies wrap the request like a context manager: code before yield runs pre-handler, code after runs post-response (even on exceptions). That's why get_db can guarantee commit-on-success/rollback-on-error/close-always in one place — the resource lifecycle is centralized, not sprinkled across handlers.",
      },
      {
        heading: "Composition builds policy from parts",
        body: "require_admin depends on get_current_user which depends on the bearer scheme — a chain. Each link is unit-testable; FastAPI caches resolved deps per request (get_current_user runs once even if three deps need it). Auth stacks, pagination params, feature flags — all become composable, declarative building blocks.",
      },
      {
        heading: "Testing is the payoff",
        body: "app.dependency_overrides[get_db] = fake swaps real Postgres for a test session globally, no monkeypatching. The B5 test suite leans on exactly this seam. DI's real product is seams — places where implementations swap without editing consumers.",
      },
    ],
    level3: [
      {
        heading: "DI without a container",
        body: "Java/C# DI means container frameworks, XML/annotations, singleton scopes. FastAPI's is function-parameter injection resolved per request — no container, no magic registry, and honest Python signatures. The scope story is simpler (request-scoped by default; app-scoped via module singletons like the engine); know that 'DI framework' and 'DI pattern' are separable ideas, and you're using the pattern with minimal framework.",
      },
      {
        heading: "Failure modes at the seam",
        body: "Commit-in-dependency (AxonFlux's choice) means handlers can't half-commit, but also means work after yield can fail AFTER the response was formed — errors there surface as 500s with completed handlers. Alternative: explicit commit in handlers — more control, more boilerplate, more forgotten commits. Also: sync deps run in the threadpool, async deps on the loop — mixing them wrongly (blocking call in async dep) stalls the event loop. Your psycopg2 stack is sync, so sync deps are correct today.",
      },
    ],
    axonflux:
      "api/dependencies.py is the entire seam: get_db, get_conn, get_current_user, require_admin. Every router consumes these; the test suite overrides them.",
    companies:
      "Spring (Java) built an empire on DI; NestJS mirrors it in TypeScript; Go's wire generates it. Every seriously tested codebase uses constructor/parameter injection at boundaries, framework or not.",
    whenNot:
      "Scripts and pipelines with linear flow don't need injection ceremony — weekly_pipeline.py constructing its own engine is correct; there's nothing to swap and no per-request lifecycle. DI everywhere is architecture cosplay.",
    files: [
      { path: "api/dependencies.py", note: "all four dependencies — read top to bottom" },
      { path: "tests/", note: "dependency_overrides in the B5 suite" },
    ],
    interview: [
      {
        q: "What problem does Depends solve beyond saving keystrokes?",
        a: "Lifecycle centralization (session commit/rollback/close in one try/finally), composition (auth chains), and test seams (dependency_overrides swaps implementations without monkeypatching). It turns handler signatures into declarations of need — the framework owns resolution and teardown.",
      },
      {
        q: "Why two different DB dependencies?",
        a: "They encode the data architecture at the type level: ORM session for app.* transactional writes; raw connection for read-only analytics over derived/raw. A handler's signature instantly reveals which layer and which safety contract it uses — injection as documentation.",
      },
      {
        q: "Where does the session commit, and what's the trade-off?",
        a: "In get_db after yield: success → commit, exception → rollback, always close. Handlers stay clean and can't forget cleanup; the cost is less granular control (no partial commits mid-handler) and post-yield failures happening after handler logic completed. For CRUD-shaped writes that trade is right.",
      },
    ],
    mentor: {
      deep: [
        "yield-dependency lifecycle (before/after response, exception path)",
        "dependency_overrides as THE test seam",
        "Injection choices as architectural documentation",
      ],
      abstract: ["FastAPI's resolution/caching internals"],
      mistakes: [
        "Opening sessions inside handlers alongside injected ones",
        "Blocking calls inside async dependencies",
        "Making everything injectable — ceremony without seams",
      ],
    },
    exercises: [
      "Trace one request through bearer→get_current_user→require_admin→handler→get_db teardown; write the sequence from memory.",
      "Write a paginate dependency (limit/offset with caps) and use it in two routers.",
      "In a test, override get_db with a session that always rolls back; verify no test data persists.",
    ],
    pos: { x: 32, y: 22 },
  },
  {
    id: "plugin-architecture",
    title: "Plugin / Registry Architecture",
    domain: "backend",
    difficulty: "intermediate",
    status: "ready",
    tagline: "the core discovers features; features never edit the core",
    analogy:
      "Power strips, not hardwiring. Each appliance (tool) ends in a standard plug (manifest + router); the strip (registry) discovers whatever's plugged in. Adding a lamp doesn't mean rewiring the house — and a broken lamp doesn't take out the kitchen.",
    problem:
      "AxonFlux keeps growing staff tools — cash closure, pamphlets, entity resolution, BOM, campaign studio. If each new tool edits main.py, imports tangle, merge conflicts multiply, and the core file becomes a graveyard of feature knowledge.",
    withoutIt:
      "main.py accumulates imports and mount calls; removing a feature means hunting references; the frontend hardcodes a tool list that drifts from the backend's reality.",
    prereqs: ["dependency-injection"],
    unlocks: [],
    level1: [
      "Contract: each tool is a package under api/tools/<name>/ with __init__.py exporting MANIFEST (id, name, icon, required_role, tags) and router.py exporting an APIRouter. register_tools() scans the directory, imports each package, mounts its router, collects manifests.",
      "GET /api/tools serves the collected manifests — the frontend sidebar renders from it. Add a tool: create a folder. Remove: delete it. main.py never changes.",
    ],
    level2: [
      {
        heading: "Convention over configuration",
        body: "Discovery works because structure IS the contract: right folder + right exported names = registered. No YAML, no central list to forget. The cost of convention: it must be documented (docs/architecture/tool-plugins.md) and violations fail at import time — so fail LOUDLY. A silent skip on a malformed tool is how features vanish mysteriously.",
      },
      {
        heading: "The manifest is a boundary object",
        body: "MANIFEST carries UI concerns (icon, name), authz hints (required_role), and taxonomy (tags) across the backend/frontend boundary in one typed shape. The frontend stays generic — it renders whatever the registry reports. This is the same 'metadata travels with the unit' idea as Python entry_points, VS Code extension manifests, and Kubernetes CRDs.",
      },
    ],
    level3: [
      {
        heading: "Registry pattern trade-offs",
        body: "Import-time side effects make startup order matter and circular imports easier to create — tools must import from api core, never from each other (enforce by convention + review). Dynamic discovery also defeats static analyzers: 'find usages' won't see registration. Mitigations: keep the discovery function tiny and boring, have a startup log line listing registered tools, and a test asserting the expected manifest set — regression protection for accidental unregistration.",
      },
      {
        heading: "When plugins earn their keep",
        body: "The pattern pays when units share a lifecycle and boundary shape (mount+manifest here). It does NOT pay for one-off integrations or when 'plugins' need to call each other richly — that's a modular monolith with internal APIs, a different pattern. AxonFlux's agents (Phase D) will face this choice: agents as registry-discovered plugins vs orchestrated modules. The manifest pattern extends nicely; the inter-agent communication does not — keep orchestration explicit.",
      },
    ],
    axonflux:
      "api/tools/__init__.py:register_tools() + five conforming tools; /api/tools manifest endpoint; sidebar consumes it. docs/architecture/tool-plugins.md is the contract doc.",
    companies:
      "pytest plugins, Django apps, VS Code extensions, Airflow providers, Backstage plugins — every platform product converges on discover-by-contract.",
    whenNot:
      "Two integrations that never change: hardcode them. Plugins that must interact richly with each other: modular monolith with explicit interfaces instead. Registry magic without a growth trajectory is indirection tax.",
    files: [
      { path: "api/tools/__init__.py", note: "register_tools discovery loop" },
      { path: "api/tools/base.py", note: "ToolManifest shape" },
      { path: "api/tools/cash_closure/__init__.py", note: "smallest conforming example" },
      { path: "docs/architecture/tool-plugins.md", note: "the written contract" },
    ],
    interview: [
      {
        q: "Why auto-discovery instead of explicit registration in main.py?",
        a: "Open/closed principle operationally: features extend the system without modifying the core, killing merge conflicts and core-file bloat. The manifest endpoint also makes the frontend self-configuring. Cost: convention must be documented and violations must fail loudly at startup, plus a test pinning the expected registry contents.",
      },
      {
        q: "How do you stop plugin sprawl from becoming a dependency mess?",
        a: "One rule: tools depend on core (dependencies.py, ai/, storage/), never on sibling tools. Shared needs get promoted into core. The registry stays a flat namespace; anything requiring tool-to-tool calls is a sign it belongs in core or in an explicit orchestrator, not the plugin layer.",
      },
    ],
    mentor: {
      deep: [
        "Structure-as-contract and why violations must fail loudly",
        "Manifest as cross-boundary metadata",
        "The no-sibling-imports rule",
      ],
      abstract: ["importlib/pkgutil mechanics"],
      mistakes: [
        "Silently skipping malformed plugins",
        "Tools importing tools",
        "Reaching for plugins when two hardcoded lines would do",
      ],
    },
    exercises: [
      "Create a toy hello tool as a folder; verify it appears in /api/tools and the sidebar with zero core edits, then delete it.",
      "Write the pytest that asserts the exact set of registered manifests.",
      "Break a manifest on purpose; make startup fail with a clear error naming the offending tool.",
    ],
    pos: { x: 30, y: 40 },
  },

  // ── BACKEND — PHASE 1 FRONTIER (planned) ───────────────────────────
  {
    id: "caching-redis",
    title: "Caching with Redis",
    domain: "backend",
    difficulty: "intermediate",
    status: "planned",
    tagline: "workbench tools vs warehouse walks — and knowing when the workbench lies",
    analogy:
      "Keeping frequently used tools on your workbench instead of walking to the warehouse each time. Fast — until the warehouse inventory changes and your workbench copy is stale. Caching is easy; knowing when the workbench lies (invalidation) is the famous hard problem.",
    problem:
      "Dashboard endpoints re-run heavy aggregates over derived.* on every load, but the underlying data changes only when the pipeline rebuilds. Identical work, repeated, for identical answers.",
    withoutIt:
      "Every dashboard visit pays full query cost; p95 latency is hostage to Postgres load; the same 55ms×N queries burn connections for answers that were valid all week.",
    prereqs: ["postgres-optimization"],
    unlocks: ["background-workers", "rate-limiting"],
    level1: [
      "Cache-aside: try Redis GET; miss → query Postgres → SET with TTL → return. AxonFlux has an unusually clean invalidation story: derived data ONLY changes on pipeline rebuild, so 'pipeline completed' → flush the analytics namespace. Bounded staleness by construction, not by guessing TTLs.",
      "Phase 1 builds this: Redis alongside Postgres, cache-aside on the heaviest analytics reads, rebuild-triggered invalidation, and TTL as a backstop only.",
    ],
    level2: [
      {
        heading: "Deep content lands with Phase 1",
        body: "Full Level 2/3 (stampede protection, key design, serialization trade-offs, cache hit-ratio measurement, why Redis over in-process LRU here) is written as the feature is built — Academy content ships with the code it teaches.",
      },
    ],
    level3: [],
    axonflux:
      "Planned Phase 1: cache-aside on analytics routers, keyed by endpoint+params, flushed by the pipeline-completed event.",
    companies:
      "Shopify/GitHub cache-aside over MySQL/Postgres; Stripe rate-limits in Redis; basically the entire read-heavy web.",
    whenNot:
      "Before EXPLAIN says the query is sane (cache hides, never fixes), on write-heavy or per-user-unique reads (hit ratio ≈ 0), or when staleness is unacceptable and invalidation events don't exist.",
    files: [{ path: "api/routers/analytics.py", note: "the endpoints that will gain cache-aside" }],
    interview: [
      {
        q: "Why is AxonFlux's cache invalidation unusually easy?",
        a: "Derived data is immutable between pipeline runs — there is exactly one mutation event (rebuild completed), so invalidation is a single namespace flush on that event. Most systems suffer because writes are continuous and scattered; mine are batched by architecture.",
      },
    ],
    mentor: {
      deep: ["Cache-aside flow", "Invalidation-event thinking before TTL guessing"],
      abstract: ["Redis internals until needed"],
      mistakes: ["Caching before profiling", "TTL-only 'invalidation' on data with real mutation events"],
    },
    exercises: ["Before building: list every AxonFlux read endpoint and classify — cacheable-until-rebuild vs per-user vs real-time."],
    pos: { x: 40, y: 54 },
  },
  {
    id: "background-workers",
    title: "Background Workers & Job Queues",
    domain: "backend",
    difficulty: "intermediate",
    status: "planned",
    tagline: "the cashier takes orders; chefs cook — never block the counter",
    analogy:
      "Sending kitchen orders to chefs while the cashier keeps serving customers. The cashier (API) records the order (job) and hands over a numbered ticket (job id); chefs (workers) cook in the back; customers check their number (status endpoint). Nobody waits at the counter for biryani.",
    problem:
      "POST /pipeline/trigger spawns a subprocess: no retries, no status, no queue, no protection against two concurrent rebuilds racing on TRUNCATE. Upcoming LLM jobs (embeddings, content generation) are minutes-long — HTTP requests cannot host them.",
    withoutIt:
      "Long work ties up API workers or runs as fire-and-forget subprocesses with zero observability; failures vanish; double-triggers corrupt state.",
    prereqs: ["idempotent-rebuilds", "caching-redis"],
    unlocks: ["event-driven-outbox", "agents-orchestration"],
    level1: [
      "Pattern: API enqueues a job record (Redis broker) and returns 202 + job id immediately. Worker processes pull jobs, execute with retries/backoff, write status (queued→running→done/failed) to a table the UI polls.",
      "Phase 1 replaces the pipeline subprocess with this, adding a single-flight lock (one rebuild at a time) — turning today's race condition into a queue property.",
    ],
    level2: [
      {
        heading: "Deep content lands with Phase 1",
        body: "Broker choice on Windows dev (arq/dramatiq vs Celery), ack/redelivery semantics, poison jobs and dead-letter handling, job idempotency keys — written alongside the implementation.",
      },
    ],
    level3: [],
    axonflux: "Planned Phase 1: job queue for pipeline runs, then reused by embedding refresh (Phase 2) and content generation (Phase 3).",
    companies: "Sidekiq (Ruby world's backbone), Celery/RQ/arq in Python shops, BullMQ in Node — every 'export started, we'll email you' feature.",
    whenNot:
      "Work under ~1s belongs in the request; a weekly task with no user waiting can stay a scheduled script. Queues add moving parts — adopt when latency or reliability demands, not for architecture points.",
    files: [{ path: "api/routers/pipeline.py", note: "subprocess trigger to be replaced" }],
    interview: [
      {
        q: "Why does 'run pipeline' need a queue when cron worked for years?",
        a: "The button made it user-triggered: now two clicks race on TRUNCATE, failures are invisible, and there's no status. A queue gives single-flight locking, retries, and a status contract — cron never had users.",
      },
    ],
    mentor: {
      deep: ["202 + job-status contract", "why job handlers must be idempotent (redelivery)"],
      abstract: ["Broker wire protocols"],
      mistakes: ["Fire-and-forget threads in the API process", "Non-idempotent handlers meeting at-least-once redelivery"],
    },
    exercises: ["Design the app.jobs table first: states, transitions, who writes each, and the exact unique constraint enforcing single-flight."],
    pos: { x: 34, y: 68 },
  },
  {
    id: "event-driven-outbox",
    title: "Event-Driven Architecture & the Outbox Pattern",
    domain: "backend",
    difficulty: "advanced",
    status: "planned",
    tagline: "Kafka's lessons at honest scale",
    analogy:
      "A restaurant's order spike: the waiter writes the order AND the kitchen ticket in one motion on carbon paper — impossible for one to exist without the other. The outbox is carbon paper for databases: the business write and the 'tell others' event commit in the same transaction; a relay delivers tickets to the kitchen afterward, retrying freely.",
    problem:
      "When the pipeline finishes, several things must happen: flush caches, refresh embeddings, notify. Calling them inline couples the pipeline to every consumer; calling them after commit risks 'data changed but nobody heard' when the process dies between the two.",
    withoutIt:
      "Dual-write inconsistency: DB updated but event lost (or event sent but transaction rolled back). Consumers drift from producers; adding a consumer means editing the producer.",
    prereqs: ["background-workers", "idempotent-rebuilds"],
    unlocks: [],
    level1: [
      "Outbox: within the pipeline's final transaction, INSERT INTO app.events(type='pipeline_completed', payload). A relay (worker) polls unprocessed events and dispatches handlers — cache flush, embedding refresh — each idempotent, each retryable, none coupled to the pipeline.",
      "This teaches at-least-once delivery, consumer idempotency, and ordering — Kafka's core curriculum — with zero new infrastructure and at a scale where the answers are honest.",
    ],
    level2: [
      {
        heading: "Deep content lands with Phase 1",
        body: "Transactional guarantees, relay design (poll vs LISTEN/NOTIFY), event schema/versioning, and the explicit written contrast with Kafka (when partitioned logs, consumer groups, and replay actually earn their complexity) arrive with the build.",
      },
    ],
    level3: [],
    axonflux: "Planned Phase 1: app.events outbox written by the pipeline job, relay in the worker, first consumers = cache flush + notification.",
    companies:
      "The outbox pattern is microservices-canon (popularized via Debezium CDC). Kafka earns its place at LinkedIn/Uber scale — thousands of events/sec, many teams, replay needs. Same concepts, different justification thresholds.",
    whenNot:
      "One producer, one consumer, same process? Call the function. Kafka for a single-store weekly batch is résumé-driven engineering — the interview answer that kills: 'what was your throughput?'",
    files: [{ path: "pipelines/weekly_pipeline.py", note: "will write the completion event" }],
    interview: [
      {
        q: "Why an outbox instead of just publishing after commit?",
        a: "Publish-after-commit is a dual write: crash between commit and publish loses the event silently. Outbox rides the SAME transaction as the data change — event existence is atomic with the change — and the relay retries delivery under at-least-once, with idempotent consumers absorbing duplicates.",
      },
      {
        q: "Why not Kafka?",
        a: "My event rate is one event per pipeline run and a handful of consumers in one codebase. Kafka's costs (cluster ops, partitioning design, consumer-group semantics) buy throughput, fan-out across teams, and replay — none of which exist here. Postgres outbox teaches identical semantics; I can state exactly the scale where I'd migrate: sustained multi-producer event streams and cross-team consumers.",
      },
    ],
    mentor: {
      deep: ["Dual-write problem — THE reason this pattern exists", "at-least-once + idempotent consumer, again"],
      abstract: ["CDC/Debezium until you have real streams"],
      mistakes: ["Publishing inside request handlers without transactional guarantees", "Adopting Kafka to look serious"],
    },
    exercises: ["Draw the crash-timeline diagram: where dual-write loses events, where outbox cannot."],
    pos: { x: 42, y: 82 },
  },
  {
    id: "rate-limiting",
    title: "Rate Limiting",
    domain: "backend",
    difficulty: "beginner",
    status: "planned",
    tagline: "bouncer math: token buckets at the door",
    analogy:
      "A nightclub bouncer with a counter: N entries per minute; beyond that, wait outside. Token bucket = the counter refills steadily and bursts are okay until tokens run out — polite to humans, ruthless to loops.",
    problem:
      "Login endpoints invite brute force; LLM endpoints burn real money per call. Nothing currently stops a runaway script (or a hostile guest on the tailnet) from hammering either.",
    withoutIt: "Credential stuffing runs free; one buggy frontend loop can spend the day's LLM budget in minutes.",
    prereqs: ["caching-redis"],
    unlocks: [],
    level1: [
      "Token bucket per key (user id / IP / API key) in Redis: atomic decrement, steady refill, 429 with Retry-After when empty. Two tiers for AxonFlux: strict on /auth/login, budget-shaped on /ai/* endpoints.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 1", body: "Bucket vs sliding window, atomicity via Lua/INCR-EXPIRE, per-role limits, and cost-aware limits for LLM routes arrive with implementation." },
    ],
    level3: [],
    axonflux: "Planned Phase 1: Redis token buckets as FastAPI middleware/dependency on auth + AI routes.",
    companies: "Stripe/GitHub publish X-RateLimit headers from exactly this machinery; Cloudflare sells it as a product.",
    whenNot: "Purely internal endpoints behind trusted infra with no cost exposure — complexity without threat model.",
    files: [{ path: "api/routers/auth.py", note: "first protected route" }],
    interview: [
      {
        q: "Why token bucket over fixed windows?",
        a: "Fixed windows allow 2× bursts at boundaries (end of minute + start of next). Token bucket refills continuously — smooth limit, burst-tolerant up to capacity, and one atomic Redis op per request.",
      },
    ],
    mentor: {
      deep: ["Bucket math and the boundary-burst flaw of fixed windows"],
      abstract: ["Lua scripting details"],
      mistakes: ["Rate limiting by IP behind a proxy without X-Forwarded-For handling — you limit the proxy"],
    },
    exercises: ["Decide the actual numbers: login attempts/min per IP, LLM calls/hour per user — justify each from cost or threat."],
    pos: { x: 46, y: 92 },
  },
];
