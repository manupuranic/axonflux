import type { Topic } from "./types";

// Machine Learning + AI Engineering topics.

export const ML_AI_TOPICS: Topic[] = [
  // ── MACHINE LEARNING ────────────────────────────────────────────────
  {
    id: "basket-analysis",
    title: "Basket Analysis (Association Rules)",
    domain: "ml",
    difficulty: "beginner",
    status: "ready",
    tagline: "counting beats guessing: support, confidence, lift",
    analogy:
      "A shopkeeper who's watched the counter for 20 years just knows: dosa-batter buyers pick up coconut chutney. Basket analysis is that intuition made countable — across every bill ever printed, which pairs appear together more than luck predicts?",
    problem:
      "'Frequently bought together' needs to be trustworthy. An LLM asked for pairings would invent plausible-sounding ones; you have 100k+ real bills that contain the truth already.",
    withoutIt:
      "Recommendations are vibes — either hand-picked (stale, biased) or hallucinated. Cross-sell placement and bundle offers have no evidence behind them.",
    prereqs: ["three-layer-architecture"],
    unlocks: ["vector-search"],
    level1: [
      "One SQL self-join on bill_no: rows sharing a bill are co-purchases. Count pair frequencies, keep pairs seen ≥5 times → derived.product_associations (30,018 pairs).",
      "Three honest metrics: support = how often the pair occurs at all; confidence(A→B) = of bills with A, how many have B (directional!); lift = how much more often the pair occurs than if A and B were independent. Lift > 1 = real signal; lift ≈ 1 = coincidence dressed nicely.",
    ],
    level2: [
      {
        heading: "Why lift is the one that matters",
        body: "Milk co-occurs with everything — high confidence, zero insight — because milk is in every basket. Lift divides by base rates: P(A∩B)/(P(A)·P(B)). It answers 'does buying A actually CHANGE the odds of B?' Confidence sells milk with everything; lift finds dosa-batter→chutney. When ranking recommendations, lift (with a support floor) beats confidence.",
      },
      {
        heading: "The min-support floor is noise control",
        body: "A pair seen twice might be one family's weird Tuesday. The ≥5 co-occurrence floor trades recall for precision — rare-but-real pairs are sacrificed to kill flukes. Every association-mining system has this dial; classic Apriori is literally 'prune everything below min-support, then extend'. Your SQL does one pass of pairs (2-itemsets) — Apriori generalizes to triples and beyond, which you don't need for a shelf-placement use case.",
      },
    ],
    level3: [
      {
        heading: "From counting to collaborative filtering",
        body: "Association rules are item-item and memory-based: no model, just counts — transparent and rebuildable in the pipeline. The next rungs: item-item collaborative filtering (cosine over co-purchase vectors — handles popularity better), matrix factorization (latent taste dimensions; the Netflix-era workhorse), then learned embeddings (two-tower models). Each rung adds cold-start and serving complexity. For a single store where staff must TRUST and explain recommendations, counted rules with lift are defensible and debuggable — 'the model' is a SQL file.",
      },
      {
        heading: "Failure modes",
        body: "Entity-resolution feeds this: if one product has three barcodes, its pairs fragment below the support floor (why 10_product_associations.sql runs AFTER alias remapping). Seasonality: mango pairs vanish off-season — a rebuild-weekly pipeline naturally tracks this, but comparing associations across seasons needs date-windowed variants. Symmetry: support is symmetric, confidence is not — serving confidence(A→B) when you meant B→A inverts the story.",
      },
    ],
    axonflux:
      "sql/rebuild_derived/10_product_associations.sql (after alias remap); GET /api/products/{barcode}/recommendations; 'Frequently Bought Together' in the product drawer.",
    companies:
      "Amazon's original item-item collaborative filtering paper started here; Instacart/grocery chains run association mining for aisle placement and substitution suggestions.",
    whenNot:
      "Sparse interaction data (new store, few bills) — counts are noise; personalized ranking across millions of users — you'd graduate to learned models. And never an LLM: this is arithmetic over facts, hallucination adds negative value.",
    files: [
      { path: "sql/rebuild_derived/10_product_associations.sql", note: "the whole 'model'" },
      { path: "api/routers/products.py", note: "recommendations endpoint" },
    ],
    interview: [
      {
        q: "Why not use an LLM or embeddings for 'bought together'?",
        a: "The ground truth is in my bills — co-occurrence is a counting problem with exact answers. LLMs would hallucinate plausible pairs; embeddings measure semantic similarity ('two brands of soap'), which is substitution, not complementarity. Counted lift is transparent, testable, and rebuilds with the pipeline. I'd add embeddings later for a DIFFERENT question — similar products — and label them as such.",
      },
      {
        q: "Explain lift to a store manager.",
        a: "If chutney is in 10% of all bills, but in 60% of bills containing dosa batter, batter multiplies chutney's odds by 6 — lift 6. Lift 1 means no relationship; below 1 means buyers of A actively avoid B.",
      },
    ],
    mentor: {
      deep: ["Lift vs confidence (base-rate correction)", "Support floors as precision/recall dial", "Complementarity (co-purchase) vs similarity (embeddings) — different questions"],
      abstract: ["Full Apriori/FP-Growth algorithms"],
      mistakes: ["Ranking by confidence and recommending milk with everything", "Ignoring direction of confidence", "Running association mining before entity resolution"],
    },
    exercises: [
      "Hand-compute support/confidence/lift for one pair from 10 sample bills; verify against the derived table.",
      "Query the top 10 pairs by confidence and by lift; write two sentences on why the lists differ.",
      "Design the date-windowed variant: associations for festival months only.",
    ],
    pos: { x: 58, y: 12 },
  },
  {
    id: "entity-resolution",
    title: "Entity Resolution (Fuzzy Matching)",
    domain: "ml",
    difficulty: "intermediate",
    status: "ready",
    tagline: "same thing, three barcodes — analytics split three ways",
    analogy:
      "A school register where 'Mohammed', 'Mohamed', and 'Md.' are one student marked absent three ways. Until you declare them the same person, every attendance report is wrong. Entity resolution is deciding which records are the same real-world thing — carefully, because merging two actual different students is worse than the original mess.",
    problem:
      "The billing system assigns new barcodes on re-entry: 'HESARU BELE 500GM' exists under three codes. Sales history fragments; demand looks smaller than reality; dead-stock flags fire on products that sell fine under a sibling code.",
    withoutIt:
      "Every product analytic understates truth by the fragmentation factor. Forecasting (B1) trains on shredded series. Recommendations miss pairs (see basket-analysis).",
    prereqs: ["three-layer-architecture"],
    unlocks: ["embeddings"],
    level1: [
      "Pipeline: RapidFuzz scores name similarity → candidate clusters → staff reviews in a UI (swap canonical direction, inspect MRP/brand) → confirmed pairs land in app.product_aliases (alias barcode → canonical barcode) → derived layer remaps at aggregation source via LEFT JOIN + COALESCE.",
      "Two non-negotiable design rules: a human confirms every merge (false merges corrupt everything downstream), and merges live in app.* as data — raw stays untouched, and an unmerge is a DELETE, fully reversible.",
    ],
    level2: [
      {
        heading: "Blocking: the O(n²) escape hatch",
        body: "All-pairs on 30k products = 450M comparisons. Blocking compares only within candidate groups (shared name prefix + same numeric tokens like '500'): near-linear work, tiny recall loss. Every real ER system (customer dedup at banks, MDM tools) lives or dies by blocking design — the fuzzy scorer is the easy part.",
      },
      {
        heading: "The threshold is an empirical, per-dataset fact",
        body: "--min-score 78 wasn't chosen from theory: scores 62–77 were manually inspected and found to be false positives in THIS catalog ('IDLI RAVA 1KG' vs 'IDLY RICE 1KG' — high string similarity, different products). Numeric tokens (500GM vs 1KG) carry disproportionate meaning in product names, which generic edit-distance underweights. Lesson: similarity thresholds are dataset properties, calibrated against labeled samples, never constants from a blog.",
      },
      {
        heading: "Remap at the source, not the edges",
        body: "Alias mapping applies where aggregation begins (01_product_daily_metrics), in the dimension view (05), and in basket mining (10) — so every downstream table inherits merged identity automatically. Remapping at query time in each endpoint would mean N places to forget. Fix identity once, at the narrowest waist.",
      },
    ],
    level3: [
      {
        heading: "Precision vs recall asymmetry",
        body: "A missed merge (false negative) = analytics stay slightly fragmented — annoying, visible, fixable later. A wrong merge (false positive) = two real products' histories permanently blended in every derived table until someone notices — silent corruption. This asymmetry justifies the whole human-review design and the high threshold: optimize precision, accept recall debt. The same asymmetry drives medical-test and fraud-flag design; naming it is a strong interview move.",
      },
      {
        heading: "Where an LLM (or embeddings) actually could help",
        body: "The 62–77 gray zone is where string metrics fail — 'MTR Badam Mix' vs 'Badam Drink MTR' needs world knowledge. Options: embedding similarity as a second scorer (catches word-order and synonymy), or a cheap LLM as a tiebreaker with structured yes/no + reason on ONLY the gray zone (bounded cost, human still confirms). Primary pipeline stays deterministic — LLM as a narrow adjudicator, not the engine. This is the correct shape for most 'should we add AI?' questions.",
      },
    ],
    axonflux:
      "scripts/cluster_product_names.py (blocking + RapidFuzz), /tools/entity-resolution review UI, app.product_aliases (migration 006), remap joins in steps 01/05/10.",
    companies:
      "Master Data Management is an industry (Informatica, Tamr); banks dedupe customers across systems; Google/Amazon product-catalog matching runs the same blocking→score→adjudicate shape at planet scale.",
    whenNot:
      "If a reliable shared key exists (GTIN/EAN verified), matching is a join, not ER. Don't fuzzy-match what upstream discipline could prevent — cheaper to fix data entry when feasible.",
    files: [
      { path: "scripts/cluster_product_names.py", note: "blocking + scoring, --min-score 78" },
      { path: "api/migrations/versions/006_product_entity_resolution.py", note: "aliases + suggestion queue" },
      { path: "sql/rebuild_derived/01_product_daily_metrics.sql", note: "remap at aggregation source" },
    ],
    interview: [
      {
        q: "Why does a human confirm every merge?",
        a: "Error asymmetry: false merges silently corrupt every downstream table; false non-merges just delay cleanup. With ~800 suggestions, minutes of review buys correctness no threshold guarantees. Automation would need precision so high that proving it costs more than reviewing.",
      },
      {
        q: "30k products — how do you avoid comparing all pairs?",
        a: "Blocking: candidates must share a name prefix and numeric tokens (sizes/weights), collapsing 450M comparisons to thousands within blocks. Tiny recall risk at block boundaries, traded consciously for tractability — blocking design, not the scorer, is the scaling decision in ER.",
      },
      {
        q: "Where would AI fit in this pipeline?",
        a: "Only the gray zone: pairs scoring 62–77 where string metrics lack world knowledge. Embedding similarity or a structured-output LLM tiebreaker on that bounded set, feeding the same human queue. Deterministic first pass, AI as narrow adjudicator, human as final authority.",
      },
    ],
    mentor: {
      deep: ["Blocking as THE scaling idea", "Precision/recall asymmetry justifying human review", "Reversibility via app-layer mapping"],
      abstract: ["RapidFuzz scorer internals"],
      mistakes: ["Trusting a global threshold from a tutorial", "Auto-merging above 'high' scores", "Remapping identity per-endpoint instead of at the source"],
    },
    exercises: [
      "Run clustering at --min-score 70, sample 20 gray-zone pairs, hand-label them; compute the precision you'd have shipped.",
      "Unmerge one alias, rebuild, verify the histories cleanly separate — prove reversibility.",
      "Prototype the embedding second-scorer on 50 gray pairs; measure agreement with your labels.",
    ],
    pos: { x: 66, y: 28 },
  },
  {
    id: "mlflow-tracking",
    title: "Experiment Tracking (MLflow)",
    domain: "ml",
    difficulty: "beginner",
    status: "ready",
    tagline: "a lab notebook the computer fills in",
    analogy:
      "A chemistry lab notebook. Every run records ingredients (hyperparameters), conditions (data window, features), and results (metrics) — so 'which mixture worked?' has an answer months later. Without it, science degrades into 'I think the third try was good?' Untracked ML is exactly that.",
    problem:
      "Model development is dozens of runs varying features, windows, and hyperparameters. Human memory cannot hold which combination produced which MAE — and 'best model' claims need receipts.",
    withoutIt:
      "model_final_v2_REAL.pkl. Results that can't be reproduced because nobody recorded the feature list. Regressions ship because the comparison baseline was a memory.",
    prereqs: [],
    unlocks: ["demand-forecasting", "llm-evals"],
    level1: [
      "MLflow records runs: params (learning rate, depth, feature set), metrics (MAE, RMSE per horizon), artifacts (the model file, plots), tags. The UI (port 5001) sorts experiments by metric — model selection becomes a query, not a recollection.",
      "AxonFlux's ml/ notebooks log every training run; the XGBoost model that writes derived.demand_predictions was chosen by comparing tracked MAE against the WMA baseline — a defensible, reproducible promotion.",
    ],
    level2: [
      {
        heading: "The baseline is the point",
        body: "01_baseline.ipynb (weighted moving average) exists so 'XGBoost is better' means 'beats WMA's MAE on the same evaluation window'. Improvement claims are comparative or they're nothing. Every serious ML org enforces a dumb-baseline-first rule; skipping it is the most common self-deception in the field.",
      },
      {
        heading: "What must be logged for reproducibility",
        body: "Params and metrics are obvious; the silent killers are data lineage (which raw window, which feature SQL version) and environment (library versions — hence MLmodel/conda.yaml artifacts). Your derived layer helps: features come from versioned SQL in git, so a git SHA + date window nearly pins the dataset — a benefit of pipeline-materialized features most notebook workflows lack.",
      },
    ],
    level3: [
      {
        heading: "From tracking to registry to serving",
        body: "Tracking answers 'what happened'; a model registry answers 'what's in production' (staging/production stages, rollback). AxonFlux's promotion path — batch predict into derived.demand_predictions during the pipeline — sidesteps online serving entirely: no model server, no latency SLO, predictions are just rows. That's the correct architecture when consumers read daily numbers, and it makes 'rollback' = 're-run with previous model artifact'. Know when batch-scoring beats a serving endpoint: whenever freshness tolerance ≥ pipeline cadence.",
      },
      {
        heading: "LLM-era continuity",
        body: "Experiment tracking is the direct ancestor of LLM evals (Phase 4): runs→eval runs, params→prompt versions, metrics→judge scores. The discipline transfers wholesale — one reason to learn it properly on tabular ML first, where metrics are honest numbers not judge opinions.",
      },
    ],
    axonflux:
      "ml/notebooks/01–04 log to ml/mlflow.db; ml/train.py + predict.py operationalize; predictions land in derived via migration 007's table.",
    companies:
      "MLflow (Databricks) and Weights & Biases are the standard pair; every ML team at Uber/Airbnb-scale built or bought exactly this before trusting any model in production.",
    whenNot:
      "One-off analyses with no model promotion need no tracking server — a notebook cell suffices. Tracking is for anything that might ship or be compared.",
    files: [
      { path: "ml/notebooks/01_baseline.ipynb", note: "WMA baseline — the yardstick" },
      { path: "ml/notebooks/03_xgboost_demand.ipynb", note: "tracked training runs" },
      { path: "ml/train.py", note: "operationalized training" },
    ],
    interview: [
      {
        q: "How do you know your model is actually better?",
        a: "Tracked comparison against a naive baseline on identical evaluation windows — WMA vs XGBoost MAE, same products, same dates, logged in MLflow. 'Better' is a diff between two run records, not an impression.",
      },
      {
        q: "How does your model get to production, and how do you roll back?",
        a: "Batch scoring: the pipeline loads the chosen artifact and writes derived.demand_predictions — no serving infra because consumers need daily granularity. Rollback = re-score with the previous tracked artifact; predictions are rebuildable rows like every other derived table.",
      },
    ],
    mentor: {
      deep: ["Baseline-first discipline", "What reproducibility actually requires (data lineage + env)", "Batch scoring vs online serving decision"],
      abstract: ["MLflow storage internals"],
      mistakes: ["Comparing runs with silently different data windows", "Tracking metrics but not the feature-set identity", "Building a model server when batch rows suffice"],
    },
    exercises: [
      "Reproduce the promoted model's MAE from its MLflow record alone — params, window, features. If you can't, find what wasn't logged.",
      "Add a 'git_sha' tag to training runs; verify feature SQL is pinned by it.",
      "Write the two-paragraph promotion memo: which run, vs which baseline, on which window, by how much.",
    ],
    pos: { x: 56, y: 46 },
  },
  {
    id: "demand-forecasting",
    title: "Demand Forecasting (XGBoost vs Baselines)",
    domain: "ml",
    difficulty: "advanced",
    status: "ready",
    tagline: "gradient-boosted trees on window-function features",
    analogy:
      "An experienced buyer predicts tomorrow's dosa-batter demand from: recent sales (lags), the weekly rhythm (day-of-week), the season, and gut feel for momentum (rolling trends). XGBoost is that buyer's reasoning, learned from every product's history simultaneously — thousands of tiny if-then rules voting together.",
    problem:
      "Replenishment needs tomorrow's demand per product. The SQL WMA (weighted moving average) in step 03 is transparent but blind: it can't use day-of-week, holidays, or cross-product patterns, and it lags trend changes.",
    withoutIt:
      "Restock recommendations chase last week's average: systematic under-ordering into festivals, over-ordering into lulls, and no way to improve because there's nothing to tune.",
    prereqs: ["sql-window-functions", "mlflow-tracking"],
    unlocks: [],
    level1: [
      "Features come free from the derived layer: lag_1, lag_7, rolling 7/30/60 means and stddev, day_of_week — step 02 is literally a feature store. One global XGBoost model trains across ALL products (not one model per product), learning shared structure like weekday effects once.",
      "Gradient boosting = an ensemble of shallow trees, each correcting the previous ensemble's residual errors. On tabular data like this, boosted trees still beat neural approaches at a fraction of the cost — the honest 2026 default.",
    ],
    level2: [
      {
        heading: "Why one global model",
        body: "Per-product models starve: most products sell sparsely, and 30k models is an ops nightmare. A global model pools data — barcode-level features let it specialize where history is rich while borrowing strength where sparse (cold-ish start built in). This is the same reason retailers moved from per-SKU ARIMA farms to pooled gradient boosting; per-series models survive only for a handful of high-volume, idiosyncratic series.",
      },
      {
        heading: "Time-series validation: never shuffle",
        body: "Random train/test splits leak the future backward (rolling means straddle the split). Correct: temporal holdout — train on history up to T, evaluate strictly after T, ideally walk-forward across several folds. Every impressive-but-fake forecasting result in industry traces to leaky validation; this is the chapter to over-learn.",
      },
      {
        heading: "The 2.9M→392K lesson",
        body: "Exporting the full dense matrix OOM'd the notebook. Fix: push filtering into SQL (active products, relevant window) before pandas ever sees data — 392K rows. General law: the database is better at reducing data than Python is at surviving it. SQL pushdown is an ML-engineering skill, not a detour from it.",
      },
    ],
    level3: [
      {
        heading: "Objectives and the intermittency problem",
        body: "Supermarket demand is intermittent — many zero days. Squared-error objectives on zero-inflated targets bias toward the mean; alternatives: Tweedie objective (XGBoost supports it, designed for zero-inflated positives), quantile objectives (predict P90 for safety stock — procurement often wants a quantile, not the mean!), or two-stage models (P(sale) × E[qty|sale]). Knowing that THE OBJECTIVE is a modeling decision, not a default, separates practitioners from API callers.",
      },
      {
        heading: "Drift, retraining, and monitoring",
        body: "Weekly retraining inside the pipeline naturally tracks slow drift (seasons, assortment). The missing piece — and a roadmap item — is prediction monitoring: log MAE-when-actuals-arrive per week; alert on degradation. Model observability parallels the AI-observability topic: deploy is the midpoint, not the finish.",
      },
      {
        heading: "Why not ARIMA/Prophet/deep nets",
        body: "ARIMA: per-series, struggles with intermittency and exogenous features. Prophet: strong for a few smooth seasonal series, not 30k sparse SKUs. Deep (DeepAR/TFT): competitive at big-retailer scale with rich covariates, but data-hungry and ops-heavy — wrong cost/benefit for one store. Your notebook sequence (baseline→feature-engineering→XGBoost→evaluation) mirrors the honest industrial path.",
      },
    ],
    axonflux:
      "ml/notebooks/02–04, ml/train.py, predictions batch-written to derived.demand_predictions (migration 007), consumed by replenishment logic.",
    companies:
      "Instacart/DoorDash/Walmart run gradient-boosted (and increasingly hybrid) demand systems; M5 competition (Walmart data) was won by LightGBM ensembles — public proof trees rule tabular retail.",
    whenNot:
      "Brand-new products (no history → use category priors/analogies), promotions with no historical analogue (causal problem, not forecasting), or when a 7-day average already meets business tolerance — model complexity must buy ordering decisions, not decimal points.",
    files: [
      { path: "ml/notebooks/03_xgboost_demand.ipynb", note: "global model training" },
      { path: "ml/notebooks/04_evaluation.ipynb", note: "temporal holdout evaluation" },
      { path: "sql/rebuild_derived/02_product_daily_features.sql", note: "the feature store" },
      { path: "api/migrations/versions/007_ml_demand_predictions.py", note: "predictions table" },
    ],
    interview: [
      {
        q: "Why XGBoost over ARIMA or a neural net for this?",
        a: "30k sparse, intermittent series with tabular covariates: pooled gradient boosting learns shared structure (weekday, seasonality) across products, handles zeros, and trains in minutes on one machine. ARIMA is per-series and covariate-poor; deep models need data and ops budget a single store can't justify. I benchmarked against a WMA baseline in MLflow to prove the added complexity paid.",
      },
      {
        q: "How do you validate a forecasting model?",
        a: "Strictly temporal: train ≤T, test >T, walk-forward folds. Never random splits — rolling features leak the future. Metric per horizon (MAE day+1 vs day+7), compared against the naive baseline on identical windows.",
      },
      {
        q: "Your MAE looks great but procurement still overstocks. Why might that be?",
        a: "Point forecasts of the mean aren't ordering decisions. Ordering wants a service-level quantile (e.g., P90) plus lead time. Optimizing MAE optimizes the median-ish center; I'd switch to quantile/Tweedie objectives aligned with the actual cost asymmetry of stockout vs overstock.",
      },
    ],
    mentor: {
      deep: ["Temporal validation and leakage", "Global-model pooling rationale", "Objective choice under intermittency", "SQL pushdown before pandas"],
      abstract: ["XGBoost split-finding internals (histogram tricks)"],
      mistakes: ["Shuffled CV on time series (the classic)", "Judging by MAE alone when the decision is a quantile", "Per-product model farms", "Loading raw data into pandas to filter it there"],
    },
    exercises: [
      "Deliberately train with a random split, compare test MAE vs temporal split — measure the leakage lie.",
      "Retrain with Tweedie objective; compare zero-day behavior.",
      "Add weekly MAE-vs-actuals logging to the pipeline; chart four weeks of model health.",
    ],
    pos: { x: 62, y: 64 },
  },

  // ── AI ENGINEERING ──────────────────────────────────────────────────
  {
    id: "provider-abstraction",
    title: "LLM Provider Abstraction",
    domain: "ai",
    difficulty: "intermediate",
    status: "ready",
    tagline: "universal socket for Anthropic, OpenAI, OpenRouter",
    analogy:
      "A universal travel adapter. Appliances (features) plug into one socket shape; the adapter handles each country's plugs (provider APIs). Your pamphlet AI doesn't know or care whether Claude or GPT answered — and swapping vendors is a config change, not a rewrite.",
    problem:
      "Provider APIs differ in message formats, tool-call schemas, and streaming shapes. Features coded against one SDK marry it: price hikes, outages, or a better model all become rewrites touching every feature.",
    withoutIt:
      "anthropic.messages.create() calls scattered through five tools; adding OpenRouter means five parallel implementations; every feature must know two tool-call formats forever.",
    prereqs: [],
    unlocks: ["tool-calling", "cost-tracking"],
    level1: [
      "api/ai/provider.py defines the neutral contract: Message/ToolCall/ToolResult dataclasses + AIProvider.complete(messages, system, tools, model) → CompletionResult. AnthropicProvider and OpenAIProvider translate the neutral shape to each API; OpenRouter reuses the OpenAI adapter with a different base_url — one adapter, many vendors, because OpenRouter speaks the OpenAI dialect.",
      "Features construct ChatSession(provider='anthropic'|'openai'|'openrouter', model=...) and never see SDK types. The model allowlist (config.py) gates what's callable — governance at the abstraction boundary.",
    ],
    level2: [
      {
        heading: "The adapter pattern, earned",
        body: "This is textbook Ports & Adapters: the port is AIProvider, adapters translate per vendor. The subtle craft is choosing the neutral representation — YOUR Message type must express the union of what you need (text, tool calls, tool results) without leaking any vendor's quirks (Anthropic's content blocks, OpenAI's function_call legacy). Every leaked quirk becomes permanent API surface. Study how ToolResult carries is_error — a deliberate neutral concept both vendors can express.",
      },
      {
        heading: "What the abstraction deliberately excludes",
        body: "No streaming in the port (SSE handled elsewhere), no vendor-specific extras (thinking budgets, logprobs). An abstraction is defined by what it refuses to expose — each exclusion keeps swap-ability real. When a feature someday needs a vendor-only capability, the honest choices are: extend the port for everyone, or acknowledge that feature is vendor-married and bypass explicitly. Silent leakage is the failure mode.",
      },
    ],
    level3: [
      {
        heading: "Lowest-common-denominator risk",
        body: "Abstractions rot two ways: leaking (vendor types escape) or starving (port too minimal, features route around it). The starving risk is real in LLM land because vendors differentiate fast (caching controls, structured-output modes, thinking). Mitigation: version the port consciously; add capabilities as optional, feature-detected extensions (supports_structured_output?) rather than if-provider branches in features. LangChain's history shows both failure modes at scale — worth reading as a cautionary tale, and a reason building your own thin layer was the better learning move.",
      },
      {
        heading: "Allowlist as cost/safety governance",
        body: "is_model_allowed() centralizes 'what may run here' — one place to ban an expensive model, pin versions for reproducibility, or stage a new one. Combined with cost.py's per-turn accounting, the abstraction layer becomes the natural chokepoint for governance: budget enforcement, model migration, incident kill-switches. Platform teams at LLM-heavy companies build exactly this 'LLM gateway' layer; you own a miniature.",
      },
    ],
    axonflux:
      "api/ai/provider.py (port), api/ai/providers/anthropic.py + openai.py (adapters), config.py (allowlist), consumed by ChatSession everywhere AI runs.",
    companies:
      "OpenRouter/LiteLLM productized the pattern; Vercel AI SDK and every platform team's internal 'LLM gateway' (Uber, Pinterest write about theirs) are this diagram with more features.",
    whenNot:
      "Single-provider hackathons — YAGNI. Or when a feature's value IS a vendor-exclusive capability; then bypass the port explicitly and label the coupling, don't dilute the abstraction to pretend.",
    files: [
      { path: "api/ai/provider.py", note: "the port: neutral types + AIProvider ABC" },
      { path: "api/ai/chat.py", note: "_make_provider — adapter selection" },
      { path: "api/ai/config.py", note: "ALLOWED_MODELS governance" },
    ],
    interview: [
      {
        q: "Walk me through your provider abstraction and one hard design call.",
        a: "Neutral Message/ToolCall/ToolResult types + an AIProvider port; per-vendor adapters translate; OpenRouter rides the OpenAI adapter via base_url. Hard call: keeping the port minimal — no streaming, no vendor extras — because every exposed quirk becomes permanent surface. Vendor-only needs would enter as feature-detected optional capabilities, not if-branches.",
      },
      {
        q: "How do you switch a feature from Claude to GPT, and what breaks?",
        a: "Constructor argument + allowlist entry — no feature code. What can break is behavioral, not structural: prompt sensitivity and tool-call reliability differ by model. That's why evals (Phase 4) matter — the abstraction makes swaps cheap, evals make them safe.",
      },
    ],
    mentor: {
      deep: ["Port design: choosing neutral types, deciding exclusions", "Leak vs starve failure modes", "Gateway layer as governance chokepoint"],
      abstract: ["Vendor SDK internals — the adapters quarantine them"],
      mistakes: ["Letting one vendor's message shape become the 'neutral' type", "if provider == 'x' branches inside features", "Abstracting a single provider speculatively"],
    },
    exercises: [
      "Add a mock provider (canned responses) as a third adapter; run a pamphlet AI flow fully offline.",
      "Diff Anthropic vs OpenAI adapter translation of the same tool-result turn; list every quirk quarantined.",
      "Design (paper) the optional-capability mechanism for structured outputs across providers.",
    ],
    pos: { x: 80, y: 6 },
  },
  {
    id: "cost-tracking",
    title: "LLM Cost Tracking",
    domain: "ai",
    difficulty: "beginner",
    status: "ready",
    tagline: "the taxi meter every AI feature must run",
    analogy:
      "A taxi meter. Every LLM call burns tokens like kilometers — invisible until the monthly bill. A meter on every ride (per-call cost computed from token counts × model rates) turns 'AI is expensive?' into 'the pamphlet highlight feature costs ₹3 per session, and yesterday it doubled — why?'",
    problem:
      "Token costs are per-call, tiny, and compounding — a chatty agent loop (10 tool rounds!) multiplies silently. Without measurement, features can't be priced, regressions can't be caught, and 'should this use Haiku or Sonnet?' has no data.",
    withoutIt:
      "The bill is a monthly surprise attributed to nothing. A prompt change that doubles context slips through. Model choices are vibes.",
    prereqs: ["provider-abstraction"],
    unlocks: ["ai-observability"],
    level1: [
      "Providers return prompt_tokens/completion_tokens per call. cost.py maps (provider, model) → per-token rates; ChatSession sums across all tool-loop rounds and returns cost_usd on every TurnResult — cost is part of the result contract, not an afterthought.",
      "Because it lives in the abstraction layer, every feature gets metering for free — the same chokepoint argument as the model allowlist.",
    ],
    level2: [
      {
        heading: "Attribution is the design decision",
        body: "A number is useless without a 'to whom': per-feature (pamphlet vs campaign chat), per-session, per-user, per-model. TurnResult carries provider/model/cost — the aggregation dimension you persist determines the questions you can answer later. Log lines die; rows in a table (feature, model, tokens, cost, timestamp) become dashboards. The pending step is persisting per-turn records — currently costs are computed but ephemeral.",
      },
      {
        heading: "Rates drift; pin them",
        body: "Model prices change and models deprecate. Hardcoded rate tables silently lie after a price change — date-stamp the table, alert on unknown models rather than defaulting to 0 (a zero-cost unknown model is an accounting hole). Small discipline, real money.",
      },
    ],
    level3: [
      {
        heading: "From metering to budget enforcement",
        body: "Metering (observe) matures into governance (control): per-feature monthly budgets, per-user rate limits shaped by cost not count (one Opus call ≈ 60 Haiku calls), and kill-switches when burn spikes. The rate-limiting topic intersects here: LLM endpoints should be limited in rupees, not requests. Interview line: 'my rate limiter's unit is cost, because requests aren't the scarce resource — tokens are.'",
      },
      {
        heading: "Cost as an eval metric",
        body: "Phase 4 evals score quality; pairing each eval run with its cost makes model selection two-dimensional: 'Haiku scores 92% of Sonnet at 8% of the price on highlight generation' is an engineering decision. Quality-per-rupee is the metric mature teams optimize — and you already collect both halves.",
      },
    ],
    axonflux:
      "api/ai/cost.py (rate table + calculate_cost), ChatSession accumulating across tool rounds, cost_usd surfaced in TurnResult and the campaign chat UI.",
    companies:
      "OpenAI/Anthropic dashboards give org-level views; serious teams build per-feature attribution (Notion, Intercom engineering posts) because org-level can't answer 'which feature is burning money'.",
    whenNot:
      "Over-engineering alert: a single low-traffic internal feature doesn't need budget enforcement machinery — metering yes (it's nearly free at the chokepoint), governance when spend or features multiply.",
    files: [
      { path: "api/ai/cost.py", note: "rate table — check date-stamping" },
      { path: "api/ai/chat.py", note: "accumulation across tool rounds" },
    ],
    interview: [
      {
        q: "How do you know what your AI features cost?",
        a: "Metering at the provider-abstraction chokepoint: every turn returns cost computed from token counts × pinned rates, summed across tool-loop rounds. Attribution by feature and model. Next maturity step is persistence + budgets — limits denominated in cost, since tokens, not requests, are the scarce resource.",
      },
      {
        q: "Your AI bill doubled this week. Debug it.",
        a: "Per-feature cost series isolates where; then per-turn records show whether it's volume (more calls), verbosity (more tokens/call — usually a prompt or context regression), or mix (model shift). Without attribution you're reading tea leaves; with it, it's a GROUP BY.",
      },
    ],
    mentor: {
      deep: ["Chokepoint metering", "Attribution dimensions decide answerable questions", "Cost-denominated limits"],
      abstract: ["Exact per-vendor billing nuances (cached-token discounts) until material"],
      mistakes: ["Computing cost but not persisting it", "Defaulting unknown models to zero cost", "Rate tables without dates"],
    },
    exercises: [
      "Add app.ai_usage (feature, provider, model, tokens, cost, ts) and persist every TurnResult; chart a week by feature.",
      "Compute quality-per-rupee for Haiku vs Sonnet on 20 highlight generations (manual quality scores).",
      "Find the most expensive single turn ever; explain its token count from the transcript.",
    ],
    pos: { x: 92, y: 16 },
  },
  {
    id: "tool-calling",
    title: "Tool Calling & the Agent Loop",
    domain: "ai",
    difficulty: "intermediate",
    status: "ready",
    tagline: "the model proposes, your code disposes",
    analogy:
      "A brilliant consultant with no hands. They can't touch your database — they can only fill out request forms ('run search_products with query=rice') and read the results you bring back. The consultant reasons; YOUR code acts; the loop of form→result→next form is an agent. Safety lives in which forms exist, never in trusting the consultant.",
    problem:
      "LLMs generate text; useful work needs actions — query the catalog, mutate a pamphlet DSL, fetch images. Free-text 'commands' parsed from prose are brittle and unsafe. You need a structured contract between model intent and code execution.",
    withoutIt:
      "Either the AI only chats (no product context, no edits), or you regex 'intents' out of prose — undebuggable, unsafe, and one clever user input away from disaster.",
    prereqs: ["provider-abstraction"],
    unlocks: ["structured-outputs", "agents-orchestration", "rag", "mcp", "ai-observability"],
    level1: [
      "Round: send messages + tool schemas → model returns either text (done) or tool_calls → your code executes each (catching exceptions into error results — never crashing the loop) → append results as a message → repeat. ChatSession caps this at MAX_TOOL_ROUNDS=10, a hard brake against infinite loops.",
      "Two deliberate AxonFlux choices: tool_choice='required' on round one (the model MUST act before narrating — stops 'I would search for...' hallucinated action), and errors returned INTO the conversation as ToolResults so the model can read the failure and retry differently — self-healing by design.",
    ],
    level2: [
      {
        heading: "Tool design is API design for a fallible caller",
        body: "The model is a caller that guesses. Good tools: small, single-purpose, typed params, descriptions that teach WHEN to use them (the model routes by description!), errors that explain ('price must be a number' beats 'ValueError'). The campaign studio's apply_dsl_patch shows the counter-lesson: one universal mutation tool is powerful but pushes correctness burden onto validation — hence its JSON-repair layer. Ten boring tools usually beat one clever tool.",
      },
      {
        heading: "The loop's termination logic",
        body: "Loop ends when: model returns pure text (natural), round cap hits (safety), or — a subtle miss — every round errors identically (the model can thrash retry loops; detecting repeated identical failures is a worthwhile upgrade). Whoever writes the loop owns runaway cost: round cap × max tool latency bounds your worst-case turn time and spend. Know YOUR numbers: 10 rounds × N tools.",
      },
      {
        heading: "State lives on your side",
        body: "history is yours — the model is stateless per call. Every round re-sends the growing transcript (why long agent sessions get expensive: context grows linearly, cost quadratically-ish across a session). This motivates conversation-memory strategies (summarize, window) and explains agent pricing intuitively.",
      },
    ],
    level3: [
      {
        heading: "Failure taxonomy of real agent loops",
        body: "1) Wrong tool choice (description problem — fix docs, not code). 2) Malformed args (schema too loose — tighten types, add enums). 3) Tool errors the model can't interpret (error messages are prompts! write them for the model). 4) Thrash loops (same call, same error, repeat — add repeated-failure detection). 5) Silent wrong success (tool succeeded, semantically wrong — only evals catch these). Note which are prompt problems vs code problems vs eval problems — routing failures to the right fix category is the actual skill.",
      },
      {
        heading: "Parallel calls and orchestration boundaries",
        body: "Models can emit multiple tool_calls per round; executing them concurrently (they're independent by contract) cuts latency — a straightforward ChatSession upgrade when tools do I/O. Beyond that lies orchestration (Phase D): multi-step workflows where YOUR code sequences agents (deterministic control flow) vs the model choosing (flexible, unpredictable). Rule of thumb: business-critical sequencing belongs in code; the model gets freedom within steps, not between them. That single sentence is most of 'agentic architecture' discourse, demystified.",
      },
    ],
    axonflux:
      "api/ai/chat.py (the loop — read all 100 lines, you own them), api/ai/tools.py (Tool contract), api/agents/tools/ (pamphlet DSL + item tools), campaign studio chat as the flagship consumer.",
    companies:
      "Every agent product is this loop with polish: Claude Code, Cursor, Sierra's support agents, GitHub Copilot Workspace. Anthropic/OpenAI tool-use APIs standardized the contract; frameworks (LangGraph) add orchestration on top.",
    whenNot:
      "Single deterministic transformations (summarize this text) need no loop — one structured-output call. And actions with irreversible consequences (send money, delete data) don't get handed to a guessing caller without human confirmation gates — AxonFlux's read-only-plus-approve Phase D stance is the correct default.",
    files: [
      { path: "api/ai/chat.py", note: "the entire loop, ~100 lines — memorize its shape" },
      { path: "api/agents/tools/pamphlet_dsl.py", note: "apply_dsl_patch — universal tool trade-off" },
      { path: "api/ai/tools.py", note: "Tool schema contract" },
    ],
    interview: [
      {
        q: "Walk me through your agent loop and its safety properties.",
        a: "Provider-neutral loop: model emits tool_calls, my code executes with per-call exception capture returned as error results (model reads failures and adapts), round cap of 10 bounds cost and runaway, forced first tool call prevents narrated-but-not-executed actions. Safety = which tools exist + caps + errors-as-data, never trusting model output as privileged.",
      },
      {
        q: "Your agent keeps calling the wrong tool. What do you fix?",
        a: "The descriptions — the model routes by reading them, so tool docs are prompts. Then schema tightening (enums over free strings). Code changes come last; most 'agent bugs' are specification bugs in the tool contract.",
      },
      {
        q: "One universal tool vs many specific tools?",
        a: "I've shipped both: apply_dsl_patch (universal mutation, maximum flexibility, needed JSON-repair and validation armor) vs small typed item tools (boring, reliable, self-documenting). Default to many-small; go universal only when the action space is genuinely open-ended, and budget for the validation layer it demands.",
      },
    ],
    mentor: {
      deep: ["The loop's control flow and termination cases", "Errors-as-data feedback design", "Tool descriptions as routing prompts", "Cost geometry of growing context"],
      abstract: ["Wire formats of tool calls (adapters own them)"],
      mistakes: ["Trusting the model executed what it described (force the call!)", "Raising exceptions out of tools instead of returning them", "Vague tool descriptions then blaming the model", "No round cap"],
    },
    exercises: [
      "Rewrite ChatSession.send's control flow from memory on paper; check against source.",
      "Add repeated-identical-failure detection (same tool+args+error twice → inject guidance message).",
      "Take one failing campaign-chat transcript, classify each failure into the five-bucket taxonomy.",
    ],
    pos: { x: 78, y: 22 },
  },
  {
    id: "structured-outputs",
    title: "Structured Outputs & Self-Healing Parsers",
    domain: "ai",
    difficulty: "intermediate",
    status: "ready",
    tagline: "contracts with a creative counterparty",
    analogy:
      "Dictating a legal form to a poet. The poet is brilliant but embellishes — adds flourishes, renames fields, wraps answers in prose. You need the FORM filled exactly. Structured output = handing the poet a rigid template, checking every box on receipt, and having a clerk (repair layer) fix the recoverable flourishes before rejecting outright.",
    problem:
      "The pamphlet DSL is machine-consumed JSON: the renderer crashes on a string where a number belongs. LLMs emit almost-JSON: trailing commas, markdown fences, '25' vs 25, invented fields. Free-form generation meets a strict consumer.",
    withoutIt:
      "The d1e3ddd bug in your own git history: DSL corruption from LLM type hallucination — renderer down, feature broken. Every LLM-writes-data feature carries this failure class.",
    prereqs: ["tool-calling"],
    unlocks: ["llm-evals", "agents-orchestration"],
    level1: [
      "Defense in depth, four layers: (1) constrain generation — tool-call args are schema-guided, far better than 'reply in JSON please'; (2) validate at the boundary — Pydantic/jsonschema on arrival, never trust; (3) repair the recoverable — strip fences, coerce '25'→25, drop unknown fields (your JSON-repair layer); (4) reject with teachable errors — validation failures go back into the loop as error results the model can act on.",
      "The insight from d1e3ddd: models hallucinate TYPES, not just facts. A schema saying 'number' doesn't stop '₹25' arriving. Validation isn't paranoia; it's the API boundary between a probabilistic producer and a deterministic consumer.",
    ],
    level2: [
      {
        heading: "Repair is a policy decision, not a hack",
        body: "What may the repairer fix silently (fences, trailing commas — syntactic noise) vs coerce loudly (type casts — log them, they're model-quality signals) vs never touch (semantic content — a repaired price is a corrupted price)? Write the policy down. Your sanitize/repair tests (test_pamphlet_sanitize.py) encode it — that's the right instinct: repair behavior is contract, contract gets tests.",
      },
      {
        heading: "Native structured-output modes",
        body: "Providers now offer constrained decoding (JSON mode / response schemas) where the model literally cannot emit invalid JSON — grammar-constrained token sampling. It kills syntax errors, NOT semantic ones (wrong-but-valid values still arrive). Layer 2 validation survives every provider feature. This is also a provider-abstraction test case: capability-detection, since support differs per vendor.",
      },
    ],
    level3: [
      {
        heading: "Schema design FOR models",
        body: "Schemas are prompts: field names teach (offer_price_inr beats p2), enums beat open strings, descriptions in the schema steer generation, required-vs-optional communicates intent. Flat-ish schemas outperform deep nesting (models lose track in deep trees). Anti-pattern: mirroring your DB schema into the model's contract — design the model-facing shape for generation reliability, then map to storage. The DSL's format-as-data design is exactly this separation.",
      },
      {
        heading: "The reliability ladder, priced",
        body: "Prompt-only JSON (~90% at best) → tool-call args (~97%+) → constrained decoding (~100% syntax) → +validation (100% structural) → +repair (recovers the recoverable) → +evals (semantic correctness — the only rung that catches 'valid but wrong'). Each rung costs engineering; where you stop is a product decision. Pamphlet DSL needed the full ladder because output feeds a renderer; highlight copy stops earlier because a human reads it before print.",
      },
    ],
    axonflux:
      "apply_dsl_patch + JSON-repair in api/agents/tools/pamphlet_dsl.py; sanitize tests; the campaign studio pipeline LLM→patch→validate→render; commit d1e3ddd as the origin story.",
    companies:
      "Extraction pipelines everywhere (Ramp receipts, Harvey legal docs, insurance intake) are structured-output ladders; OpenAI/Anthropic shipped native schema modes because the demand is universal.",
    whenNot:
      "Human-consumed prose (chat answers, draft copy) — structure would strangle quality; validate facts via evals instead. Don't force JSON where the consumer is a person.",
    files: [
      { path: "api/agents/tools/pamphlet_dsl.py", note: "patch + repair layer" },
      { path: "tests/test_pamphlet_sanitize.py", note: "repair policy as tests" },
    ],
    interview: [
      {
        q: "How do you get reliable JSON from an LLM?",
        a: "A ladder, not a trick: schema-guided tool calls or native constrained decoding for syntax; boundary validation (Pydantic) because semantic errors survive perfect syntax; a repair layer with an explicit policy for what's silently fixable vs loudly coerced vs untouchable; validation failures fed back as teachable errors. I learned layer 2 from a production incident — the model hallucinated types, not facts.",
      },
      {
        q: "Constrained decoding exists — why still validate?",
        a: "Grammar constraints guarantee parseable, not correct: a valid number can still be the wrong price, a valid enum the wrong choice. Syntax is the provider's job now; semantics remain mine — validation plus evals.",
      },
    ],
    mentor: {
      deep: ["The four-layer defense and what each catches", "Repair policy as explicit contract", "Schema-as-prompt design"],
      abstract: ["Grammar-constrained sampling internals"],
      mistakes: ["'Respond in JSON' as the whole strategy", "Silent type coercion without logging (hides model degradation)", "DB schema = model schema", "Validating syntax and shipping semantics unchecked"],
    },
    exercises: [
      "Feed 10 deliberately malformed patches through the repair layer; table: fixed / coerced / rejected — does it match the written policy?",
      "Add coercion logging; run a week of campaign chat; count silent fixes (model-quality metric!).",
      "Redesign one DSL fragment's schema purely for generation reliability; A/B 20 generations against the old shape.",
    ],
    pos: { x: 88, y: 34 },
  },

  // ── AI — FRONTIER (planned) ─────────────────────────────────────────
  {
    id: "embeddings",
    title: "Embeddings",
    domain: "ai",
    difficulty: "intermediate",
    status: "planned",
    tagline: "GPS coordinates for meaning",
    analogy:
      "Assigning GPS coordinates to meanings instead of places. 'Turmeric powder' and 'haldi' land meters apart in this space; 'turmeric' and 'toothpaste' are cities apart. Once meaning has coordinates, 'find similar' becomes 'find nearby' — geometry replaces string matching.",
    problem:
      "ILIKE '%rice%' can't find 'basmati' for 'rice', can't rank, can't handle 'something for cough'. Lexical search matches characters; customers and staff think in meanings.",
    withoutIt: "Search = exact-ish substring luck. 'Similar products', semantic dedup help, and all of RAG stay impossible.",
    prereqs: ["entity-resolution"],
    unlocks: ["vector-search", "rag"],
    level1: [
      "An embedding model maps text → a fixed-length vector (~1536 floats) where semantic similarity ≈ cosine similarity. Phase 2 embeds each product (name + category + brand + generated description) in a pipeline step — content-hashed so only changed products re-embed.",
      "Key intuition: the model was trained so that texts appearing in similar contexts land near each other. It compresses meaning, not spelling — which is exactly why it complements (not replaces) lexical search for barcode/exact-name queries.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 2", body: "Model choice (API vs local), dimensionality/cost trade-offs, what similarity actually captures (and its failure on negation/numbers), chunking for longer texts — written alongside the embedding pipeline build." },
    ],
    level3: [],
    axonflux: "Planned Phase 2: embedding column on product catalog, refreshed incrementally in the pipeline, feeding hybrid search + similar-products.",
    companies: "Spotify (track similarity), Airbnb (listing embeddings), every RAG system's foundation layer.",
    whenNot: "Exact identifiers (barcodes!), tiny vocabularies where synonyms don't exist, or when a LIKE query already satisfies users — embeddings add an index and a model dependency; buy them with a real recall problem.",
    files: [{ path: "sql/rebuild_derived/05_necessary_views.sql", note: "product dimension — the text source to embed" }],
    interview: [
      {
        q: "What do embeddings capture that fuzzy string matching doesn't?",
        a: "Meaning learned from context: synonyms ('haldi'/'turmeric'), category proximity, word-order robustness. RapidFuzz sees characters — great for typos, blind to semantics. My ER gray zone is exactly where strings fail and embeddings help.",
      },
    ],
    mentor: {
      deep: ["Similarity-as-geometry intuition", "What embedding similarity does NOT capture (negation, quantities, exactness)"],
      abstract: ["Transformer internals producing the vectors"],
      mistakes: ["Embedding barcodes/IDs and wondering why search broke", "Comparing vectors from different models"],
    },
    exercises: ["Before building: hand-pick 10 product pairs you believe are semantically close; they become the embedding smoke test."],
    pos: { x: 76, y: 44 },
  },
  {
    id: "vector-search",
    title: "Vector Search & Hybrid Retrieval (pgvector)",
    domain: "ai",
    difficulty: "intermediate",
    status: "planned",
    tagline: "nearest-neighbor meaning, joined with WHERE stock > 0",
    analogy:
      "Finding restaurants 'near you' — but in meaning-space. And crucially: 'near me, open now, serves veg' — nearness PLUS filters. pgvector keeps meaning-coordinates inside Postgres so 'similar products that are in stock and on offer' is one SQL query, not two systems glued together.",
    problem:
      "With embeddings computed, you need fast nearest-neighbor over 30k vectors AND you need results filtered/joined against live data (stock, price, signals). A separate vector DB splits one question across two systems.",
    withoutIt: "Semantic search stays a notebook demo; RAG retrieval has no engine; 'similar products in stock' requires app-side joins over two datastores.",
    prereqs: ["embeddings", "postgres-optimization"],
    unlocks: ["rag"],
    level1: [
      "pgvector adds a vector column type + distance operators + ANN indexes (HNSW). Similarity search = ORDER BY embedding <=> query_vec LIMIT k, freely combined with WHERE/JOIN — the data-locality argument for Postgres-first vector search at your scale.",
      "Hybrid retrieval (the Phase 2 endpoint): lexical (FTS/pg_trgm) catches exact names and barcodes; vector catches meaning; Reciprocal Rank Fusion merges both rankings. Neither alone survives real queries — 'MTR 500g' is lexical, 'something for cough' is semantic.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 2", body: "HNSW vs IVFFlat mechanics, recall/latency tuning, the filtered-ANN problem (pre vs post-filtering), RRF math, and when dedicated vector DBs genuinely win (100M+ vectors, multi-tenant isolation) — written with the build." },
    ],
    level3: [],
    axonflux: "Planned Phase 2: HNSW index on product embeddings, hybrid /search endpoint with RRF, similar-products rail beside basket recs.",
    companies: "Supabase/Neon bet on pgvector; Instacart/DoorDash publish hybrid-search architectures; 'Postgres until proven otherwise' is the 2026 retrieval consensus.",
    whenNot: "Hundreds of millions of vectors, heavy multi-tenancy, or vector-only workloads at massive QPS — then dedicated engines (Qdrant/Weaviate/Turbopuffer) earn their ops cost. At 30k vectors it'd be résumé-driven engineering.",
    files: [{ path: "sql/rebuild_derived/", note: "embedding + index will join the rebuild steps" }],
    interview: [
      {
        q: "Why pgvector over Pinecone?",
        a: "Data locality: my killer query is similarity JOINed with stock, price, and health signals — one SQL statement in Postgres vs app-side merging across systems. At 30k vectors, HNSW in Postgres is millisecond-fast; a dedicated vector DB adds infra, sync pipelines, and consistency questions while removing my joins. I can name the scale where that flips — that's the point.",
      },
      {
        q: "Why hybrid instead of pure vector search?",
        a: "Real query streams are bimodal: exact intents (barcode, 'MTR 500g') where lexical wins, and semantic intents ('cough remedy') where vectors win. Pure vector search rots exact matches; pure lexical misses meaning. RRF fusion is rank-based — no score-calibration between incomparable systems.",
      },
    ],
    mentor: {
      deep: ["Data-locality argument", "The bimodal-query justification for hybrid"],
      abstract: ["HNSW graph internals until tuning demands"],
      mistakes: ["Two datastores for one question", "Comparing raw scores across lexical and vector instead of rank fusion"],
    },
    exercises: ["Collect 20 real staff search queries; label each lexical-intent vs semantic-intent — your future eval set."],
    pos: { x: 84, y: 54 },
  },
  {
    id: "rag",
    title: "RAG — Retrieval-Augmented Generation",
    domain: "ai",
    difficulty: "advanced",
    status: "planned",
    tagline: "open-book exams — and knowing when the book is a database",
    analogy:
      "An open-book exam. The student (LLM) doesn't memorize your store; before answering, they look up the relevant pages (retrieval) and cite them. No relevant pages → 'I don't know' beats invention. The exam-prep skill is building a good index of the book — retrieval quality caps answer quality.",
    problem:
      "The co-pilot must answer over YOUR data — product knowledge, signals, history — which no model was trained on. Fine-tuning is wrong for facts that change weekly; context windows can't hold the catalog; hallucination fills every gap.",
    withoutIt: "The chatbot answers about groceries in general, not YOUR store — confidently wrong prices, invented products, zero grounding.",
    prereqs: ["vector-search", "tool-calling"],
    unlocks: ["conversation-memory", "agents-orchestration"],
    level1: [
      "Naive RAG: embed query → retrieve top-k chunks → stuff into context → answer with citations. Necessary vocabulary, insufficient architecture.",
      "AxonFlux's sharper thesis: most store questions ('what should I reorder?') are SQL questions — the correct 'retrieval' is a deterministic tool call against derived tables, with exact numbers. Vector RAG earns its place for UNSTRUCTURED knowledge (generated herbal descriptions, use-cases). The co-pilot is therefore a tool-first agent where semantic search is ONE tool among get_stock_alerts and friends — 'agentic RAG' as consequence of understanding your data, not as buzzword.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 3", body: "Chunking strategy, retrieval evals (does the right doc surface?), grounding/citation patterns, context-budget management, and the failure taxonomy (retrieval miss vs synthesis error) — written with the co-pilot build." },
    ],
    level3: [],
    axonflux: "Planned Phase 3: co-pilot with deterministic SQL tools + semantic product-knowledge tool, citations to sources, 'I don't know' as a first-class answer.",
    companies: "Glean (enterprise search-RAG), Notion AI, every support bot; the industry converged on exactly your split — structured questions to SQL/tools, unstructured to vectors.",
    whenNot: "When the answer lives in a table, retrieval-by-vector is strictly worse than a query — never RAG what you can SELECT. When corpus fits in context, just include it. When facts must be exact (prices!), generation must quote tool results, not paraphrase memory.",
    files: [{ path: "api/ai/chat.py", note: "the loop RAG will ride on" }],
    interview: [
      {
        q: "Design a chatbot for a supermarket's operational data.",
        a: "Split by data shape: structured questions (reorder, stock, revenue) route to typed SQL tools returning exact numbers; unstructured knowledge (product benefits) routes to vector retrieval over generated content; the LLM orchestrates via tool calling and must cite sources, with 'I don't know' allowed. Pure vector-RAG over exported table dumps — the naive design — turns precise data into fuzzy text and hallucinates aggregates.",
      },
      {
        q: "Your RAG answers are wrong. How do you debug?",
        a: "Bisect the pipeline: was the right context retrieved (retrieval eval — hit-rate on labeled queries)? If yes, did the model use it faithfully (grounding eval)? Retrieval misses need index/chunking/query work; synthesis errors need prompt/citation-forcing work. Two different illnesses, two different medicines.",
      },
    ],
    mentor: {
      deep: ["SQL-vs-vector routing by data shape — THE design decision", "Retrieval quality caps answer quality"],
      abstract: ["Reranker model internals"],
      mistakes: ["RAG-ing structured data", "Skipping retrieval evals and prompt-tweaking synthesis forever", "No 'I don't know' path"],
    },
    exercises: ["Write 15 real questions staff would ask; label each SQL-shaped vs knowledge-shaped vs hybrid — the co-pilot's routing spec and eval seed."],
    pos: { x: 78, y: 66 },
  },
  {
    id: "agents-orchestration",
    title: "Multi-Agent Orchestration",
    domain: "ai",
    difficulty: "advanced",
    status: "planned",
    tagline: "code sequences the steps; models think within them",
    analogy:
      "A kitchen brigade. The head chef (orchestrator — YOUR code) fixes the menu and sequence; station chefs (agents) get bounded jobs with clear handoffs (structured outputs). Nobody improvises the menu mid-service. Chaos kitchens where cooks decide everything look creative and plate nothing.",
    problem:
      "Phase D work — weekly intelligence reports, per-supplier PO drafts — exceeds one context window and one prompt: multi-step, multi-source, needing audit trails and human approval gates.",
    withoutIt: "One mega-prompt doing research+analysis+drafting: unreliable, undebuggable, unauditable — and failures restart from zero.",
    prereqs: ["tool-calling", "structured-outputs", "background-workers"],
    unlocks: [],
    level1: [
      "Two honest patterns cover Phase D: sequential pipeline (Weekly Intelligence: sales→stock→customers→cash→compose; each step's structured output feeds the next) and parallel fan-out (Reorder: per-supplier agents run concurrently, merge ranked). Deterministic control flow in code; model intelligence within steps.",
      "Non-negotiables from the roadmap: read-only tools, app.agent_runs audit trail, human approval before any action. Agents propose; humans dispose.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 5", body: "Checkpointing/resumability on the job queue, inter-step contract design, cost budgeting per run, failure isolation (one supplier's agent fails ≠ report dies), and the honest case against free-form agent autonomy — written with the build." },
    ],
    level3: [],
    axonflux: "Planned Phase 5: Weekly Intelligence + Reorder agents on the Phase 1 job queue, audited in app.agent_runs/agent_outputs, approval UI.",
    companies: "Sierra (support), Harvey (legal), internal ops agents at fintechs — production systems overwhelmingly use code-orchestrated workflows, not self-directed swarms.",
    whenNot: "A task one prompt handles reliably needs no agent choreography. Irreversible actions never get autonomy without human gates. Multi-agent for its own sake multiplies failure modes and cost — every added agent needs a justified boundary.",
    files: [{ path: "api/agents/", note: "existing single-agent infra to build on" }],
    interview: [
      {
        q: "Sequential vs parallel agent orchestration — how do you choose?",
        a: "By data dependency: Weekly Intelligence steps consume prior outputs → sequential. Per-supplier PO drafts are independent → fan-out and merge. The orchestrator is ordinary code with checkpoints on a job queue; agents are bounded steps with typed outputs. I keep control flow deterministic because that's what makes failures debuggable and costs bounded.",
      },
    ],
    mentor: {
      deep: ["Dependency-driven pattern choice", "Structured handoffs between steps", "Why autonomy is a liability for business-critical flows"],
      abstract: ["Agent frameworks (LangGraph et al.) — concepts first, frameworks after"],
      mistakes: ["Letting the model decide workflow order", "No audit trail", "Agents calling agents without typed contracts"],
    },
    exercises: ["Design app.agent_runs + agent_outputs schemas: statuses, checkpoints, cost columns, approval linkage — before any agent code."],
    pos: { x: 90, y: 66 },
  },
  {
    id: "conversation-memory",
    title: "Conversation Memory",
    domain: "ai",
    difficulty: "intermediate",
    status: "planned",
    tagline: "remember the decisions, not the transcript",
    analogy:
      "A good waiter mid-shift: remembers your table asked for less spice (salient fact), not every word since you sat down (transcript). Memory = deciding what's worth carrying forward when you can't carry everything.",
    problem:
      "Context windows are finite and priced per token; multi-session co-pilot use loses everything at window's edge. Resending growing transcripts is the cost problem tool-calling already exposed.",
    withoutIt: "Long sessions truncate arbitrarily (model 'forgets' the constraint from 20 turns ago) or cost balloons; cross-session continuity is zero.",
    prereqs: ["rag"],
    unlocks: [],
    level1: [
      "Pragmatic ladder for the co-pilot: rolling window (last N turns verbatim) + running summary (LLM-compressed older context) + persisted session store in app.*. Retrieval-based long-term memory (embed past conversations) is deliberately deferred — a single-user internal tool doesn't justify it yet.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 3", body: "Summarization-loss management, what to pin verbatim (numbers! constraints!), session schema design, and memory evals arrive with the co-pilot." },
    ],
    level3: [],
    axonflux: "Planned Phase 3: session persistence + window-plus-summary for the co-pilot chat.",
    companies: "ChatGPT memory, Claude Projects, support platforms carrying customer context across tickets.",
    whenNot: "Stateless single-shot features (highlight generation) — memory adds state bugs for nothing. Compliance-sensitive data may FORBID retention — memory is a policy surface, not just an optimization.",
    files: [{ path: "api/ai/chat.py", note: "history list — where windowing hooks in" }],
    interview: [
      {
        q: "How would you keep a long analytics chat coherent without unbounded cost?",
        a: "Window + summary: recent turns verbatim, older context LLM-summarized with numeric facts pinned exactly (summaries corrupt numbers — those get copied, not compressed), persisted per session. Vector memory only when cross-session recall proves needed — memory tiers should be bought with observed failure, not anticipation.",
      },
    ],
    mentor: {
      deep: ["Summarize-vs-pin policy (protect numbers)", "Memory as cost control"],
      abstract: ["Vector-memory frameworks until needed"],
      mistakes: ["Summarizing exact figures into approximations", "Building memory infrastructure before a user needs it"],
    },
    exercises: ["Take a 30-turn campaign-chat transcript; hand-write the ideal 10-line summary + pinned-facts list — your summarizer's target output."],
    pos: { x: 82, y: 78 },
  },
  {
    id: "llm-evals",
    title: "LLM Evaluation",
    domain: "ai",
    difficulty: "advanced",
    status: "planned",
    tagline: "unit tests for a nondeterministic function",
    analogy:
      "Taste-testing at a restaurant chain. You can't taste every plate (nondeterminism, volume), so you standardize recipes (prompts), keep a tasting panel with scorecards (golden set + judges), and never change a recipe without a panel pass (eval-gated deployment). 'The new chef seems good' is how chains die.",
    problem:
      "Prompt changes ship on hope: does the new highlight prompt still avoid medical claims? Does the co-pilot still quote correct prices? Manual spot-checks don't scale and regress silently.",
    withoutIt: "Every prompt edit is a production gamble; model upgrades are terrifying; 'it seems better' is the QA bar. This is the single biggest gap between AI demos and AI engineering.",
    prereqs: ["structured-outputs", "mlflow-tracking"],
    unlocks: ["prompt-versioning", "ai-observability"],
    level1: [
      "Phase 4 harness: golden datasets (real inputs + expected properties) per feature; deterministic assertions where possible (schema-valid, price matches DB, no medical-claim terms, length bounds); LLM-as-judge ONLY for irreducibly fuzzy criteria (tone), with the judge itself spot-audited; runs in pytest/CI so a failing eval blocks a prompt merge like a failing test blocks code.",
      "Direct lineage from MLflow discipline: baseline, controlled comparison, tracked runs — evals are experiment tracking where the model is a prompt.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 4", body: "Golden-set curation from production traces, judge-bias pitfalls (position, verbosity, self-preference), pass/fail thresholds vs score drift, and cost-aware eval scheduling — written with the harness." },
    ],
    level3: [],
    axonflux: "Planned Phase 4: eval suites for highlight copy, DSL patches, co-pilot answers; CI-gated; scores tracked per prompt version.",
    companies: "Anthropic/OpenAI's eval culture; Braintrust/LangSmith/Langfuse exist because every serious team needs this; 'how do you eval?' is now a standard AI-engineer interview question.",
    whenNot: "Don't judge what you can assert — LLM-judging JSON validity is waste. Truly one-off explorations don't need harnesses. But any prompt users depend on does, at whatever size.",
    files: [{ path: "tests/", note: "the pytest suite evals will extend" }],
    interview: [
      {
        q: "How do you know a prompt change didn't regress?",
        a: "Eval-gated deployment: golden inputs from production, deterministic assertions first (schema, factual price checks against the DB, forbidden-claim scans), LLM-judge only for tone-like criteria with the judge itself audited, all in CI. Prompt changes merge like code: green evals or no ship. Without this, 'iterating on prompts' means gambling.",
      },
    ],
    mentor: {
      deep: ["Assert-first, judge-last hierarchy", "Golden sets from real traces, not invented cases"],
      abstract: ["Eval-platform features until the harness outgrows pytest"],
      mistakes: ["LLM-judging the assertable", "Golden sets of easy cases only", "Evals that run 'sometimes' — ungated is unenforced"],
    },
    exercises: ["Start the golden set NOW: save 20 real highlight-generation inputs+outputs, mark each pass/fail with a one-line reason — the harness's seed."],
    pos: { x: 94, y: 78 },
  },
  {
    id: "ai-observability",
    title: "AI Observability & Tracing",
    domain: "ai",
    difficulty: "intermediate",
    status: "planned",
    tagline: "flight recorders for tool loops",
    analogy:
      "A flight recorder. When a 10-round agent turn goes wrong, 'the answer was bad' is like 'the plane landed badly' — useless without the recorder: what was retrieved, which tools ran with what args, what each round cost, where latency hid. Tracing is the black box you install BEFORE the incident.",
    problem:
      "A campaign-chat turn spans up to 10 rounds × multiple tools. When output disappoints, there's no per-step record to localize the failure — was it retrieval, tool choice, tool output, or synthesis?",
    withoutIt: "Debugging = re-running and squinting. Cost spikes have no per-step attribution. Production LLM issues become unreproducible anecdotes.",
    prereqs: ["cost-tracking", "tool-calling"],
    unlocks: [],
    level1: [
      "Phase 4: instrument ChatSession with spans — one per turn, child per round, grandchild per tool execution — carrying tokens, cost, latency, truncated payloads. Langfuse (self-hosted) or OTel GenAI conventions; the loop's ownership makes instrumentation trivial: it's ~5 well-placed emits in code you wrote.",
      "Traces feed evals (real failures → golden cases) and cost dashboards (per-step attribution) — the three Phase 4 pieces interlock.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 4", body: "Span schema design, sampling strategy, PII scrubbing in payloads, and trace-driven debugging workflows — with the build." },
    ],
    level3: [],
    axonflux: "Planned Phase 4: spans in api/ai/chat.py, self-hosted Langfuse or OTel export, linked from admin UI.",
    companies: "LangSmith/Langfuse/Braintrust adoption is universal among agent shops; OTel GenAI semantic conventions are standardizing the span vocabulary.",
    whenNot: "A single stateless prompt with evals may not need distributed-trace machinery — a log line suffices. Tracing earns its keep when calls become loops.",
    files: [{ path: "api/ai/chat.py", note: "the loop to instrument — you own every line" }],
    interview: [
      {
        q: "A user reports the AI 'gave a weird answer' yesterday. Walk me through finding out why.",
        a: "Pull the trace by session: per-round spans show what tools ran, their args and outputs, token/cost/latency per step. Failure localizes to a category — bad retrieval, wrong tool route, tool error the model misread, or synthesis drift — each with a different fix. Without traces this is an anecdote; with them it's a lookup, and the failing case goes straight into the eval golden set.",
      },
    ],
    mentor: {
      deep: ["Span hierarchy mirroring the loop", "Traces→evals flywheel"],
      abstract: ["OTel exporter plumbing"],
      mistakes: ["Logging only final answers", "Storing full payloads with PII unscrubbed", "Building dashboards before instrumenting the loop"],
    },
    exercises: ["Define the span schema on paper for one real campaign-chat turn: names, attributes, parent links — implementation becomes transcription."],
    pos: { x: 86, y: 90 },
  },
  {
    id: "prompt-versioning",
    title: "Prompt Versioning & Registry",
    domain: "ai",
    difficulty: "beginner",
    status: "planned",
    tagline: "prompts are code; treat them like it",
    analogy:
      "Recipe cards in a chain's kitchen binder — versioned, dated, signed off. 'Add more chili' isn't shouted across the kitchen; it's card v7, tested by the panel, rolled back if diners revolt. Prompts scattered as string literals are shouted recipes.",
    problem:
      "Prompts live as literals in code: no changelog of what changed when quality shifted, no linkage between a prompt version and its eval score, no rollback story.",
    withoutIt: "'The highlights got worse recently' has no diff to inspect. Two features drift apart copying similar prompts. Model migrations can't A/B safely.",
    prereqs: ["llm-evals"],
    unlocks: [],
    level1: [
      "Phase 4, deliberately small: prompts as versioned artifacts (files or a registry table) with ids + semver-ish tags; ChatSession consumers reference prompt@version; each eval run records the version it scored — quality history becomes a join. No platform purchase; a folder + convention + CI hook.",
    ],
    level2: [
      { heading: "Deep content lands with Phase 4", body: "Template-vs-instance separation, per-model prompt variants, and staged rollout patterns — with the registry build." },
    ],
    level3: [],
    axonflux: "Planned Phase 4: registry consumed by pamphlet highlights + co-pilot system prompts, joined to eval scores.",
    companies: "LangSmith/Braintrust sell prompt registries; internally most teams run exactly the files+evals+CI shape first.",
    whenNot: "One prompt, one author, exploratory phase — git history is enough. The registry earns its keep at multiple features/authors/models.",
    files: [{ path: "api/agents/", note: "current in-code prompts to be extracted" }],
    interview: [
      {
        q: "How do you manage prompts across features and model upgrades?",
        a: "As versioned artifacts: referenced by id@version, evaled per version, rolled back like code. A model upgrade is a matrix run — every prompt version × new model through the eval suite — turning migration from anxiety into a report.",
      },
    ],
    mentor: {
      deep: ["Version↔eval-score linkage as the point of the exercise"],
      abstract: ["Registry products until scale demands"],
      mistakes: ["Versioning prompts without linking eval results (changelog without meaning)", "Buying a platform before outgrowing a folder"],
    },
    exercises: ["Inventory every prompt literal in the codebase (grep system_prompt); table: feature, location, last-changed, evaled? — the registry's migration list."],
    pos: { x: 94, y: 92 },
  },
  {
    id: "mcp",
    title: "MCP — Model Context Protocol",
    domain: "ai",
    difficulty: "advanced",
    status: "planned",
    tagline: "USB-C for AI: expose AxonFlux as tools any assistant can use",
    analogy:
      "USB-C for AI systems. Before: every device×charger pair needed its own cable (every assistant×data-source pair its own integration). MCP standardizes the port — AxonFlux exposes tools once; Manastra (or any MCP client) plugs in without bespoke glue.",
    problem:
      "Manastra — the owner's personal AI — needs store intelligence (daily summary, stock alerts, cash status) without AxonFlux building Manastra-specific endpoints or Manastra learning AxonFlux's API shape.",
    withoutIt: "Bespoke integration per consumer; N assistants × M sources = N×M adapters. Store data stays siloed from the owner's AI workflows.",
    prereqs: ["tool-calling", "rbac"],
    unlocks: [],
    level1: [
      "Phase E: AxonFlux runs an MCP server exposing read-only tools (daily_summary, stock_alerts, lapsed_customers, cash_status, weekly_report). Manastra's agent discovers and calls them over the protocol — the same tool-calling contract you built internally, standardized for external clients.",
      "Security posture is the interesting part: machine API-key auth (not user JWTs), read-only scope, and a PII firewall — lapsed_customers returns counts, mobile numbers never cross the boundary. Data minimization as protocol design.",
    ],
    level2: [
      { heading: "Deep content lands with Phase E", body: "Protocol mechanics (JSON-RPC, discovery), transport choices, tool-description design for foreign agents, and versioning a public-ish contract — with the server build." },
    ],
    level3: [],
    axonflux: "Planned Phase E: MCP server wrapping existing analytics + Weekly Intelligence output, consumed by Manastra's briefing and anomaly watchdog.",
    companies: "Anthropic released MCP; Block, Apollo, and thousands of servers adopted it through 2025-26 — 'MCP server' is now a standard integration deliverable.",
    whenNot: "Internal-only tools already sharing a codebase don't need protocol overhead — ChatSession's direct tool list is simpler. MCP pays at system BOUNDARIES with independent lifecycles.",
    files: [{ path: "api/routers/analytics.py", note: "queries the MCP tools will wrap" }],
    interview: [
      {
        q: "Why expose MCP instead of a REST API the other agent could call?",
        a: "REST needs the consumer to hand-write integration; MCP is the standardized tool contract agents already speak — discovery, schemas, invocation come free for every current and future MCP client. I keep REST for humans/frontends and MCP for agent consumers, both wrapping the same query layer, with machine-key auth and a PII-minimizing tool design since the caller is autonomous.",
      },
    ],
    mentor: {
      deep: ["Boundary thinking: when protocol beats bespoke", "PII minimization for autonomous callers"],
      abstract: ["JSON-RPC plumbing (SDK handles it)"],
      mistakes: ["Exposing write tools to an autonomous external agent", "Reusing human JWTs for machine callers"],
    },
    exercises: ["Write tool descriptions for all six planned MCP tools as if the reader is a foreign agent with zero AxonFlux context — then test them on a fresh Claude session."],
    pos: { x: 76, y: 92 },
  },
];
