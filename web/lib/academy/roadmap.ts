import type { RoadmapPhase } from "./types";

// The portfolio-arc roadmap. Honest fits only — rejected tech is listed
// below with reasons; the rejections are interview ammunition.

export const ROADMAP: RoadmapPhase[] = [
  {
    id: "phase-1",
    phase: 1,
    title: "Production Backbone",
    goal: "Make the platform operationally real: authorization, caching, jobs, events.",
    mvp: true,
    dependencies: "None — start here. RBAC first (small, unblocks everything).",
    features: [
      { name: "✅ A4 RBAC: manager role + require_manager + endpoint audit", difficulty: "beginner" },
      { name: "Redis cache-aside on analytics (rebuild-triggered invalidation)", difficulty: "intermediate" },
      { name: "Job queue for pipeline (status, retries, single-flight lock)", difficulty: "intermediate" },
      { name: "Transactional outbox: pipeline_completed → cache flush + notify", difficulty: "intermediate" },
      { name: "Rate limiting on auth + AI endpoints", difficulty: "beginner" },
    ],
    concepts: ["Cache invalidation", "Idempotency keys", "Task queues & delivery semantics", "Outbox pattern", "Authorization lattices"],
    companies: "Stripe (idempotency), Shopify (cache-aside), every backend team's daily bread.",
    learningValue: 5,
    interviewValue: 5,
    productionValue: 5,
    complexity: 3,
    resume: "Event-driven cache invalidation and job orchestration over Redis — every word defensible.",
  },
  {
    id: "phase-2",
    phase: 2,
    title: "Search & Embedding Infrastructure",
    goal: "The retrieval foundation everything AI stands on: lexical → vectors → hybrid.",
    mvp: true,
    dependencies: "Phase 1 workers (embedding refresh jobs ride the queue).",
    features: [
      { name: "pg_trgm + Postgres FTS on product names", difficulty: "beginner" },
      { name: "Embedding pipeline step (content-hash skip) → pgvector + HNSW", difficulty: "intermediate" },
      { name: "Hybrid search endpoint with RRF fusion", difficulty: "advanced" },
      { name: "Embedding-based 'similar products' beside basket recs", difficulty: "intermediate" },
    ],
    concepts: ["Embeddings", "ANN indexes (HNSW/IVFFlat)", "Lexical vs semantic retrieval", "Rank fusion", "Incremental indexing"],
    companies: "Instacart/DoorDash hybrid product search; the entire RAG industry's substrate.",
    learningValue: 5,
    interviewValue: 5,
    productionValue: 4,
    complexity: 3,
    resume: "Hybrid lexical+vector product search in Postgres (pgvector, RRF) with incremental embedding pipeline.",
  },
  {
    id: "phase-3",
    phase: 3,
    title: "Retail Co-pilot (RAG + Agentic)",
    goal: "Flagship AI feature: 'what should I reorder?' answered by tools + retrieval, grounded and cited.",
    mvp: true,
    dependencies: "Phases 1–2. Folds in C1 content generation as the RAG corpus.",
    features: [
      { name: "Tool-first agent over deterministic SQL tools", difficulty: "intermediate" },
      { name: "RAG tool over generated product content (C1)", difficulty: "intermediate" },
      { name: "Structured briefing cards (validated outputs)", difficulty: "intermediate" },
      { name: "Conversation memory: window + summary, persisted sessions", difficulty: "intermediate" },
      { name: "Streaming SSE with tool-progress events", difficulty: "advanced" },
      { name: "'What should I do today?' scheduled briefing", difficulty: "intermediate" },
    ],
    concepts: ["Agentic RAG vs naive RAG", "Tool design", "Grounding & citations", "Context budgeting", "Memory tiers"],
    companies: "Glean, Notion AI, Sierra; internal copilots at Uber/Ramp/Airbnb.",
    learningValue: 5,
    interviewValue: 5,
    productionValue: 4,
    complexity: 4,
    resume: "Agentic retail co-pilot routing structured questions to SQL tools and knowledge questions to vector retrieval — the senior-level split.",
  },
  {
    id: "phase-4",
    phase: 4,
    title: "LLMOps: Evals, Tracing, Prompt Registry",
    goal: "What separates AI engineers from API callers: measure, trace, version.",
    mvp: false,
    dependencies: "Phase 3 (needs features worth evaluating). Highest differentiation per hour — do immediately after MVP.",
    features: [
      { name: "Eval harness: golden sets + assertions + judged tone, CI-gated", difficulty: "advanced" },
      { name: "Tracing: spans across the tool loop (Langfuse/OTel)", difficulty: "intermediate" },
      { name: "Prompt registry: versions joined to eval scores", difficulty: "intermediate" },
      { name: "Cost dashboard on persisted per-turn records", difficulty: "beginner" },
    ],
    concepts: ["Offline vs online evals", "LLM-as-judge and its biases", "Regression-testing nondeterminism", "GenAI telemetry"],
    companies: "Anthropic/OpenAI eval culture; Braintrust/LangSmith/Langfuse's entire customer base.",
    learningValue: 5,
    interviewValue: 5,
    productionValue: 4,
    complexity: 4,
    resume: "Eval-gated prompt deployment with distributed tracing across a multi-provider LLM stack — almost no portfolio has this.",
  },
  {
    id: "phase-5",
    phase: 5,
    title: "Multi-Agent Intelligence",
    goal: "Production agent patterns: two agents, audited, human-approved — restraint as the feature.",
    mvp: false,
    dependencies: "Phases 1 (queue), 3 (tools), 4 (agents without evals/tracing are undebuggable).",
    features: [
      { name: "Weekly Intelligence Agent (sequential: sales→stock→customers→cash→report)", difficulty: "advanced" },
      { name: "Reorder Agent (parallel fan-out per supplier → merged draft POs)", difficulty: "advanced" },
      { name: "app.agent_runs / agent_outputs audit + approval workflow", difficulty: "intermediate" },
    ],
    concepts: ["Sequential vs fan-out orchestration", "Typed inter-step contracts", "Checkpointing on queues", "Human-in-the-loop gates"],
    companies: "Sierra, Harvey, ops-agent teams across fintech — code-orchestrated, never free-roaming.",
    learningValue: 4,
    interviewValue: 5,
    productionValue: 4,
    complexity: 5,
    resume: "Multi-agent supply-chain intelligence with audit trails and approval gates — read-only agents as a design position.",
  },
  {
    id: "phase-6",
    phase: 6,
    title: "MCP Server",
    goal: "Expose AxonFlux as standardized tools for an external AI consumer (Manastra) — with a real user.",
    mvp: false,
    dependencies: "Phase 5 (weekly_report wraps that agent).",
    features: [
      { name: "Read-only MCP tools: daily_summary, stock_alerts, cash_status, weekly_report", difficulty: "intermediate" },
      { name: "Machine API-key auth plane (separate from user JWTs)", difficulty: "intermediate" },
      { name: "PII firewall: counts cross the boundary, mobiles never do", difficulty: "intermediate" },
    ],
    concepts: ["MCP protocol", "Machine credentials", "Data minimization at boundaries", "Contract versioning"],
    companies: "Anthropic ecosystem — Block, Apollo, thousands of servers; standard 2026 integration deliverable.",
    learningValue: 4,
    interviewValue: 5,
    productionValue: 3,
    complexity: 3,
    resume: "MCP server with a real external consumer — a rarity: most portfolio MCP servers have zero users.",
  },
  {
    id: "phase-7",
    phase: 7,
    title: "Voice & Multilingual Interface",
    goal: "Remove the keyboard from the shop floor — ask out loud, in the language staff actually speak.",
    mvp: false,
    dependencies:
      "Phase 3 (tool loop) is the hard prerequisite. Voice is a transport over an existing brain; built earlier it would be a microphone wired to nothing.",
    features: [
      { name: "Speech-to-text → existing Information Agent tool loop", difficulty: "intermediate" },
      { name: "Product-name disambiguation (Indian grocery names transcribe badly)", difficulty: "advanced" },
      { name: "Kannada/Hindi input with English-normalised tool calls", difficulty: "advanced" },
      { name: "Hands-free stock check + cash-count entry on the floor", difficulty: "intermediate" },
    ],
    concepts: [
      "Speech-to-text as transport, not intelligence",
      "Confirm-before-act under transcription uncertainty",
      "Multilingual input with a single normalised tool surface",
      "Interface layers vs capability layers",
    ],
    companies:
      "Amazon warehouse voice picking; Indian retail POS vendors shipping vernacular voice input — the literacy tax is a real, measured barrier, not a novelty.",
    learningValue: 3,
    interviewValue: 4,
    productionValue: 4,
    complexity: 3,
    resume:
      "Vernacular voice interface over an existing agent loop — argued as a transport layer rather than a second agent, with confirm-before-act under transcription uncertainty.",
  },
];

export const REJECTED_TECH: { name: string; reason: string }[] = [
  {
    name: "Kafka",
    reason:
      "One store, weekly batch, one producer, no streams. 'What was your throughput?' has no survivable answer. The outbox pattern teaches the same delivery semantics at honest scale — and 'why I said no to Kafka' is a better interview story than having it.",
  },
  {
    name: "Dedicated vector DB (Pinecone/Weaviate)",
    reason:
      "30k vectors living next to the stock/price/signal columns they must be filtered by. Data locality wins; pgvector joins in one SQL statement. The flip point (100M+ vectors, multi-tenancy) is nameable — name it instead of buying it.",
  },
  {
    name: "Workflow orchestrator (Prefect/Dagster/Airflow)",
    reason:
      "The pipeline is one linear SQL chain. An orchestrator adds a scheduler UI to a for-loop. Revisit when DAGs actually branch or teams multiply.",
  },
  {
    name: "Vector long-term memory",
    reason:
      "A single-user internal tool has no cross-session recall problem yet. Memory tiers are bought with observed failures, not anticipation. Window + summary suffices for the co-pilot.",
  },
  {
    name: "Microservices",
    reason:
      "One developer, one machine, coupled domains. The modular monolith with plugin boundaries IS the correct service decomposition at this scale — and the boundaries are already drawn for a future split that will probably never be needed.",
  },
];
