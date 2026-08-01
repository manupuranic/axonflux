import type { Feature } from "./types";

export const FEATURES: Feature[] = [
  {
    id: "data-pipeline",
    title: "Weekly Data Pipeline",
    status: "shipped",
    problem:
      "The billing system has no API — staff export CSVs/XLS by hand, with duplicates, re-exports, and a broken date format. The store needs trustworthy analytics rebuilt from these messy files on demand.",
    value:
      "Every dashboard number, health signal, and restock suggestion downstream depends on this. It is the platform; everything else is a consumer.",
    architecture: [
      "data/incoming/ — staff drops export files",
      "raw_ingestion/ — header maps + readers → ingest_raw_table() (SHA-256 dedup, 2000-row chunks, batch audit)",
      "raw.* — append-only truth with import_batch_id lineage",
      "sql/rebuild_derived/00–10 — ordered TRUNCATE+rebuild steps",
      "derived.* — analytics tables (dense time series, features, signals, stock, associations)",
      "Excel sheet exports for procurement",
    ],
    codeFlow: [
      { step: "Trigger", detail: "CLI run or POST /api/pipeline/trigger (subprocess — Phase 1 moves this to a job queue)", file: "pipelines/weekly_pipeline.py" },
      { step: "Optional ingestion", detail: "latest file per report type from data/incoming/, SHA-256 gate skips known files" },
      { step: "Rebuild loop", detail: "executes SQL steps in order; 00 must run first — 01 anchors its date spine on 00's MIN date" },
      { step: "Views + exports", detail: "replenishment_sheet and conversion_attention_sheet views; Excel outputs" },
    ],
    dbFlow: [
      "raw.raw_sales_itemwise + 5 siblings ← append-only inserts",
      "derived.daily_sales_summary → product_daily_metrics (2.3M dense rows) → features → health_signals → stock_position → associations",
      "app.* untouched — joined at read time via COALESCE(canonical, derived)",
    ],
    apiFlow: [
      "POST /api/pipeline/trigger {run_ingestion} → subprocess → pipeline_runs status row",
      "Dashboard reads hit derived.* via get_conn()",
    ],
    theory: ["three-layer-architecture", "idempotent-rebuilds", "sql-window-functions", "postgres-optimization"],
    interview: [
      {
        q: "Why subprocess instead of importing the pipeline into the API?",
        a: "Process isolation: the pipeline is long-running, memory-heavy pandas work — inside the API process it would block workers and couple deploy lifecycles. Subprocess was the honest v1; the roadmap replaces it with a proper job queue for retries, status, and single-flight locking.",
      },
      {
        q: "What happens if two people trigger the pipeline simultaneously?",
        a: "Today: a race on TRUNCATE — the known weakest point, documented and scheduled for the Phase 1 queue with a concurrency lock. Being able to name your system's sharpest edge is more credible than pretending it doesn't exist.",
      },
    ],
    production: [
      "Single-flight locking is the missing guard (Phase 1)",
      "ANALYZE after rebuild keeps planner stats honest",
      "Step ordering is a real contract — document-enforced, worth a startup assertion",
    ],
    improvements: [
      "Job queue + status streaming (Phase 1)",
      "Shadow-table build + atomic swap to remove the empty-tables window",
      "pipeline_completed outbox event → cache flush + embedding refresh",
    ],
    files: [
      { path: "pipelines/weekly_pipeline.py", note: "orchestrator" },
      { path: "sql/rebuild_derived/", note: "the 11 steps" },
      { path: "raw_ingestion/common/ingest_core.py", note: "ingestion core (read-only)" },
    ],
  },
  {
    id: "auth-rbac",
    title: "Authentication & Roles",
    status: "shipped",
    problem:
      "Staff, a manager, and an admin share one dashboard on a LAN/tailnet. Who may verify cash counts, trigger rebuilds, or manage users must be enforced server-side.",
    value: "The trust boundary for every tool. Also the pattern (dependency guards) each new endpoint inherits for free.",
    architecture: [
      "POST /auth/login — bcrypt verify → JWT (sub, user_id, role, exp) signed with SECRET_KEY",
      "web/lib/auth.ts — token in localStorage, Bearer header on every call",
      "get_current_user dependency — decode + verify per request, zero DB reads",
      "require_role() factory over ROLE_LEVELS {staff:1, manager:2, admin:3} → require_staff/require_manager/require_admin, declared per route; unknown roles = level 0, fail everything",
      "/api/users — admin-only CRUD (create, role change, deactivate, password reset) + Users section on Settings; self-demotion and self-deactivation blocked",
    ],
    codeFlow: [
      { step: "Login", detail: "verify bcrypt hash, mint token", file: "api/routers/auth.py" },
      { step: "Every request", detail: "HTTPBearer → decode_access_token → CurrentUser", file: "api/dependencies.py" },
      { step: "Guarded routes", detail: "Depends(require_manager) etc. raise 403 below the required level", file: "api/dependencies.py" },
    ],
    dbFlow: ["app.users (role CHECK constraint, migration 013) read only at login — the JWT carries identity afterwards"],
    apiFlow: ["401 = unknown caller (bad/expired token) → client redirects to login; 403 = known caller, insufficient role"],
    theory: ["jwt-auth", "rbac", "dependency-injection"],
    interview: [
      {
        q: "Your token carries the role. What's the staleness story?",
        a: "Role changes apply at next login — a deliberate statelessness trade. Mitigations if needed: shorter expiry, refresh tokens, or a Redis denylist. For a three-person internal tool, documented staleness beats session infrastructure.",
      },
    ],
    production: [
      "A4 audit lesson: grep-driven sweeps replace existing guards but are blind to routes that never had one — /api/documentation shipped unauthenticated and two SSE side-door helpers kept the old default-to-staff fallback until the whole-branch review",
      "localStorage tokens are XSS-readable — acceptable on LAN, httpOnly cookies for public exposure",
      "Rate limiting on /login is a Phase 1 item",
      "Role changes apply at next login (JWT staleness) — documented trade, not a bug",
    ],
    improvements: ["Refresh tokens", "Machine API-key plane for MCP (Phase E)", "Shared UUID path-param validator (users + pipeline routers)"],
    files: [
      { path: "api/core/security.py", note: "hashing + JWT" },
      { path: "api/dependencies.py", note: "guards" },
      { path: "web/lib/auth.ts", note: "client side" },
    ],
  },
  {
    id: "campaign-studio",
    title: "Campaign Studio (AI Design Authoring)",
    status: "shipped",
    problem:
      "Weekly offer pamphlets and social creatives were manual design work. Staff need to produce A4/WhatsApp/Instagram-format designs from live product data, editing via chat.",
    value:
      "The flagship AI feature: a 3-panel editor (chat | products | preview) where an LLM mutates a JSON design DSL through tools — real agentic document generation, not a chat gimmick.",
    architecture: [
      "Design stored as a JSON DSL (format-as-data: A4/WhatsApp/IG are data, not code paths)",
      "ChatSession with product-context tools + apply_dsl_patch universal mutation tool",
      "JSON-repair + sanitize layer between model output and DSL state",
      "Deterministic renderer: DSL → HTML/CSS Grid → preview iframe → export (PDF/PNG)",
      "7-table schema, 29 endpoints (campaigns, designs, items, assets, chat)",
    ],
    codeFlow: [
      { step: "Chat turn", detail: "user message → ChatSession (forced first tool call) → tool rounds", file: "api/tools/campaign_studio/chat.py" },
      { step: "Mutation", detail: "apply_dsl_patch validates + repairs patch, applies to design state", file: "api/agents/tools/pamphlet_dsl.py" },
      { step: "Render", detail: "renderer consumes DSL — crashes here were the origin of the validation armor", file: "api/tools/pamphlets/state.py" },
      { step: "Export", detail: "client-side PDF/PNG generation per format" },
    ],
    dbFlow: ["app.campaigns/designs/items — human-authored state, survives rebuilds", "product data joined from derived at read time"],
    apiFlow: ["SSE streaming for chat; asset upload → StorageClient → URL into DSL"],
    theory: ["tool-calling", "structured-outputs", "provider-abstraction", "cost-tracking"],
    interview: [
      {
        q: "Why a DSL instead of letting the LLM write HTML?",
        a: "Constraint is the feature: the DSL bounds what the model can express to what the renderer guarantees prints correctly at A4/300dpi. LLM-written HTML is unreviewable free-form output; a typed patch against a schema is validatable, diffable, and undoable. Format-as-data also means new formats are data migrations, not new code paths.",
      },
      {
        q: "What was your hardest production bug here?",
        a: "LLM type hallucination corrupting the DSL — string where number belonged, renderer down. Fix was architectural, not a prompt tweak: validation + repair layer at the boundary, with a written policy of what's silently fixable vs rejected, encoded as tests.",
      },
      {
        q: "A sub-agent tool (set_theme's AI color generator) kept picking the wrong model. Why, and what's the general lesson?",
        a: "The tool spun up its own ChatSession and hardcoded a per-provider 'cheap model' guess instead of reusing the outer session's already-verified provider+model. Two bugs stacked: (1) it ignored state entirely and defaulted to the env var, silently calling Anthropic direct when the user was on OpenRouter — auth error. (2) once fixed to use the real provider, the hardcoded OpenRouter slug (a dated Haiku ID) turned out not to exist there at all — verified by fetching openrouter.ai/api/v1/models directly rather than trusting a remembered model name. General lesson: any sub-session spawned by a tool should inherit the caller's already-working config by default; a 'cheaper model' optimization is not worth a second independent guess about provider/model validity, and model catalogs should be verified live, not assumed from training data or old code comments.",
      },
      {
        q: "The assistant kept saying 'Theme applied!' right after a tool call that returned an error. What was actually wrong?",
        a: "Two separate bugs disguised as one. First, the system prompt said 'after tools complete, write one confirmation sentence' with no branch for failure — the model followed that literally regardless of the tool's return value, so it needed an explicit 'check every tool result for an error key first' rule. Second, and more interesting: even after that was fixed, a `style_region` request to recolor product badges genuinely could not work, because product cards are template-rendered from data (not individual DSL nodes) — there was no per-node style_overrides to attach a color to, only a font-size CSS variable. Prompt honesty and missing capability look identical from the chat transcript; only reading the tool's actual code distinguishes 'the AI is lying' from 'the AI is asked to do something the system can't do yet.'",
      },
      {
        q: "Why did 'reapply the theme on the whole page' silently fail on some elements but not others?",
        a: "CSS cascade, not an AI bug. set_theme only rewrites theme-level CSS custom properties (--accent, --primary). But any node the user had asked to color individually earlier in the conversation got a literal color_hex baked into its inline style via apply_dsl_patch — and inline styles always beat var()-referencing CSS classes. So 'reapply the theme everywhere' was structurally incapable of touching pre-pinned nodes, no matter how confidently the model narrated success. Confirmed by pulling the live DSL from Postgres and finding the exact hex values pinned on specific node IDs. Fix was a new explicit set_theme(clear_node_overrides=true) tool param that strips only color-related overrides before applying the new theme — narrower 'change the header color' requests must NOT set this flag, or they'd nuke unrelated per-node styling.",
      },
    ],
    production: [
      "Multi-round loops need tracing (Phase 4) — debugging transcripts by eye doesn't scale",
      "Highlight/copy quality is untested — first eval target",
      "Cost per session visible in UI — attribution persistence pending",
      "Sub-agent tool calls must inherit the caller's provider/model, never re-guess one — verified against the live OpenRouter catalog after two wrong hardcoded slugs shipped",
      "Template-rendered regions (product cards) have no per-node style_overrides — new capabilities there need a dedicated CSS-variable + theme-override path, not the generic node-styling tool",
      "'Write a confirmation sentence after tools complete' needs an explicit error-check branch — models follow narration instructions literally even when the tool result says error",
    ],
    improvements: ["Eval suite for patches + copy", "Prompt registry for system prompts", "Parallel tool execution in the loop"],
    files: [
      { path: "api/tools/campaign_studio/", note: "routers + chat" },
      { path: "api/agents/tools/pamphlet_dsl.py", note: "universal patch tool" },
      { path: "web/app/(internal)/tools/campaign-studio/", note: "3-panel editor" },
    ],
  },
  {
    id: "entity-resolution-feature",
    title: "Entity Resolution Tool",
    status: "shipped",
    problem: "Re-entered products get fresh barcodes; one physical product splits into 2–3 identities, shredding every analytic.",
    value: "Correctness multiplier for the whole derived layer — forecasting, associations, and health signals all sharpen after merges.",
    architecture: [
      "scripts/cluster_product_names.py — blocking (prefix + numeric tokens) + RapidFuzz, --min-score 78",
      "app.product_merge_suggestions — review queue",
      "/tools/entity-resolution — staff UI: confirm, swap canonical direction, inspect details",
      "app.product_aliases — confirmed alias→canonical map",
      "Derived rebuild remaps via LEFT JOIN + COALESCE at steps 01/05/10",
    ],
    codeFlow: [
      { step: "Cluster", detail: "offline script generates suggestions above threshold", file: "scripts/cluster_product_names.py" },
      { step: "Review", detail: "staff confirms/rejects; direction swappable", file: "api/tools/entity_resolution/" },
      { step: "Remap", detail: "next rebuild folds alias history into canonical barcode", file: "sql/rebuild_derived/01_product_daily_metrics.sql" },
    ],
    dbFlow: ["Suggestions and aliases in app.* — reversible by DELETE; raw untouched forever"],
    apiFlow: ["CRUD on suggestions/aliases through the tool router, staff-role guarded"],
    theory: ["entity-resolution", "three-layer-architecture"],
    interview: [
      {
        q: "Why is the merge stored as data instead of fixing the barcodes?",
        a: "Raw is immutable — and merges are hypotheses, not facts. As app-layer data, a wrong merge is a DELETE + rebuild away from undone. 'Fixing' raw would make errors permanent and unauditable.",
      },
    ],
    production: ["Threshold 78 is catalog-calibrated (62–77 = false positives here) — re-calibrate per dataset", "New suggestions need a re-run cadence"],
    improvements: ["Embedding second-scorer for the gray zone", "LLM tiebreaker (structured, bounded) feeding the same human queue"],
    files: [
      { path: "scripts/cluster_product_names.py", note: "blocking + scoring" },
      { path: "api/migrations/versions/006_product_entity_resolution.py", note: "schema" },
    ],
  },
  {
    id: "demand-forecasting-feature",
    title: "ML Demand Forecasting",
    status: "shipped",
    problem: "Replenishment ran on a SQL weighted moving average — blind to weekday rhythm, seasonality, and trend shifts.",
    value: "Sharper order quantities → less dead stock, fewer stockouts. Also the project's proof of real ML lifecycle discipline.",
    architecture: [
      "Feature source: derived.product_daily_features (lags, rolling stats, day_of_week) — SQL-materialized feature store",
      "SQL pushdown export (392K rows, not 2.9M) → notebooks",
      "MLflow-tracked runs: WMA baseline → feature engineering → global XGBoost → evaluation",
      "Batch scoring in pipeline → derived.demand_predictions → replenishment consumes",
    ],
    codeFlow: [
      { step: "Train", detail: "global model across products, temporal validation", file: "ml/train.py" },
      { step: "Score", detail: "batch predictions written like any derived table", file: "ml/predict.py" },
      { step: "Consume", detail: "replenishment logic reads predictions", file: "sql/rebuild_derived/06_supplier_restock_recommendations.sql" },
    ],
    dbFlow: ["derived.demand_predictions — rebuildable rows; rollback = re-score with previous artifact"],
    apiFlow: ["No serving endpoint — freshness tolerance (daily) ≥ pipeline cadence makes batch correct"],
    theory: ["demand-forecasting", "mlflow-tracking", "sql-window-functions"],
    interview: [
      {
        q: "Why batch scoring instead of a model-serving endpoint?",
        a: "Consumers need daily granularity; the pipeline already runs on that cadence. Batch rows mean no serving infra, no latency SLO, rollback by re-scoring — a serving endpoint would be complexity purchasing nothing. Batch-vs-online is a freshness-tolerance decision, not a maturity badge.",
      },
    ],
    production: ["Missing: weekly MAE-vs-actuals monitoring (drift alarm)", "Cold-start products fall back to category behavior implicitly — make explicit"],
    improvements: ["Tweedie/quantile objectives for intermittency + safety stock", "Prediction-vs-actual dashboard", "Holiday features (holidays lib already in requirements)"],
    files: [
      { path: "ml/notebooks/", note: "01 baseline → 04 evaluation" },
      { path: "ml/train.py", note: "operational training" },
    ],
  },
  {
    id: "cash-closure",
    title: "Cash Closure",
    status: "shipped",
    problem: "End-of-day physical cash counts vs system totals lived on paper — discrepancies invisible, unverifiable, unanalyzable.",
    value: "Daily financial control loop: staff submit counts, manager verifies, deltas tracked over time (future Cash Discrepancy Agent feeds on this history).",
    architecture: [
      "Date-picked closure form: system totals (derived payment breakdown) vs physical denomination grid",
      "Live delta computation client-side; submit → app.cash_closure_records",
      "Manager verify/reject flow — the verify route is gated require_manager (A4)",
    ],
    codeFlow: [
      { step: "Compare", detail: "system side from derived.daily_payment_breakdown; physical side from denomination inputs" },
      { step: "Persist", detail: "closure record with status lifecycle draft→submitted→verified/rejected", file: "api/tools/cash_closure/" },
    ],
    dbFlow: ["app.cash_closure_records — human attestations, joined against derived payment totals at read"],
    apiFlow: ["Tool-plugin router; verify endpoint is the canonical require_manager target"],
    theory: ["three-layer-architecture", "rbac", "plugin-architecture"],
    interview: [
      {
        q: "Why not store the system total in the closure record?",
        a: "It's derived data — storing a copy freezes a possibly-stale rebuild into a human record. The record stores what only humans know (physical count, attestation); system totals join live from derived. One source of truth per fact.",
      },
    ],
    production: ["Verification is manager-gated server-side; the UI's Review button is hidden below manager as UX only", "Discrepancy pattern analysis is deliberately deterministic — statistics, not LLM"],
    improvements: ["30-day pattern flags (day-of-week bias, worsening trend) in SQL", "Notification on large deltas via outbox events"],
    files: [{ path: "api/tools/cash_closure/", note: "tool plugin" }, { path: "web/components/cash-closure/", note: "denomination grid UI" }],
  },
  {
    id: "storage-abstraction",
    title: "Storage Abstraction (Local/R2)",
    status: "shipped",
    problem: "Product images and campaign assets need durable storage + CDN URLs — without marrying one vendor, and with a zero-infra dev mode.",
    value: "One StorageClient interface serves campaign uploads today and D7 image agents tomorrow; provider swap = env vars, zero code.",
    architecture: [
      "StorageClient ABC: upload/delete/public_url",
      "LocalStorageClient → data/uploads/ + FastAPI StaticFiles (dev)",
      "R2StorageClient → boto3 against any S3-compatible endpoint (prod)",
      "Selection via STORAGE_* env vars",
    ],
    codeFlow: [
      { step: "Upload", detail: "bytes + content_type → key → public URL stored in app.* (never binary in DB)", file: "api/storage/client.py" },
    ],
    dbFlow: ["app.products.image_url / campaign assets store URLs only"],
    apiFlow: ["POST upload endpoints (campaign assets, product images) → StorageClient → URL"],
    theory: ["provider-abstraction", "dependency-injection"],
    interview: [
      {
        q: "Why S3-compatible abstraction instead of R2's SDK directly?",
        a: "The S3 API is the industry's de facto storage port — coding to it makes R2/S3/MinIO interchangeable via config. Same ports-and-adapters reasoning as my LLM provider layer: the boundary is the standard, vendors are adapters. Local adapter keeps dev offline and tests hermetic.",
      },
    ],
    production: ["URLs in DB, bytes in object storage — never blobs in Postgres", "12/12 tests cover both clients"],
    improvements: ["Presigned direct-upload for large assets", "Image resize pipeline before upload"],
    files: [{ path: "api/storage/client.py", note: "both adapters" }, { path: "tests/test_storage.py", note: "contract tests" }],
  },
  {
    id: "customer-analytics",
    title: "Customer Analytics & Lapsed Tiers",
    status: "shipped",
    problem: "Bills carry mobile numbers in 4+ formats plus walk-in noise; the store can't see who's lapsing without a clean customer identity.",
    value: "Retention lens: per-customer spend/recency/payment preference, lapsed tiers (30/60/90d) for win-back action.",
    architecture: [
      "Mobile normalization CASE (strip +91/0, validate [6-9]xxxxxxxxx) — identical in every SQL touching identity",
      "Walk-in classification list → synthetic 'WALK-IN' key",
      "derived.customer_dimension + customer_metrics rebuilt from raw bills",
      "Customers UI: search, tier filters, drawer with purchase history",
    ],
    codeFlow: [
      { step: "Normalize", detail: "regex CASE in SQL — deterministic, rebuildable, no LLM anywhere near identity", file: "sql/rebuild_derived/08_customer_dimension.sql" },
      { step: "Aggregate", detail: "spend, recency, preferred payment per mobile_clean", file: "sql/rebuild_derived/09_customer_metrics.sql" },
    ],
    dbFlow: ["mobile_clean as canonical key; WALK-IN pools all anonymous traffic honestly"],
    apiFlow: ["customers router: list/search/tiers/summary + detail drawer feeds"],
    theory: ["three-layer-architecture", "sql-window-functions"],
    interview: [
      {
        q: "Why a synthetic WALK-IN customer instead of dropping anonymous bills?",
        a: "Dropping them would silently delete most of revenue from customer-level views — aggregates would disagree with daily summaries. Pooling under one honest synthetic key keeps totals reconcilable while marking the segment as unidentifiable. Data honesty over data prettiness.",
      },
    ],
    production: ["PII discipline: mobiles never leave AxonFlux (MCP returns counts only)", "Normalization logic must stay copy-identical across steps — extraction candidate"],
    improvements: ["Normalization as a SQL function (one definition)", "Win-back campaign export for lapsed tiers"],
    files: [{ path: "sql/rebuild_derived/08_customer_dimension.sql", note: "identity" }, { path: "api/routers/customers.py", note: "tiers + search" }],
  },
];

export const FEATURE_BY_ID: Record<string, Feature> = Object.fromEntries(
  FEATURES.map((f) => [f.id, f]),
);
