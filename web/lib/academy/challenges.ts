import type { Challenge } from "./types";

// Rebuild Mode — implement it yourself first, then compare with the real code.
// Ordered easiest → hardest.

export const CHALLENGES: Challenge[] = [
  {
    id: "rebuild-label-blind-name-eval",
    title: "Rebuild a Label-Blind Name Evaluator",
    topicId: "llm-evals",
    difficulty: "advanced",
    brief:
      "Design the evaluation boundary for a model deciding whether one suspicious product-name token is a genuine correction. The benchmark has human labels, but production never does. Build the contract on paper or in a scratch module before reading Phase 5B.",
    requirements: [
      "Freeze the ground-truth artifact and prove the evaluator input cannot contain labels or corrected answers",
      "Use a structured CORRECTION / NO_CHANGE / UNCERTAIN result with exactly one replacement for CORRECTION",
      "Validate edit geometry deterministically: every character outside the declared replacement must remain unchanged",
      "Explain the false-positive/false-negative asymmetry and why confidence cannot authorize a write",
      "Keep evaluation code unable to mutate production suggestions, decisions, or exports",
    ],
    hints: [
      "A file hash protects benchmark identity; an exact schema protects benchmark meaning",
      "Construct production payloads from an allowlist—do not serialize a row and delete known label fields",
      "Given original + old token + replacement, ordinary string code can calculate the only valid suggested Name",
      "The safest evaluator output is still a pending review suggestion",
    ],
    solutionFiles: [
      { path: "api/tools/item_combination_cleanup/name_semantic_eval.py", note: "the shipped evaluation boundary" },
      { path: "tests/test_cleanup_name_semantic_eval.py", note: "integrity and leakage proofs" },
    ],
    solutionNotes: [
      "Compare your boundary, not your prompt wording. Did any human-only field cross into the model payload? Could invalid free text pass? Could the evaluator write application state?",
      "The shipped system deliberately accepts abstention and requires human review even at HIGH confidence because a false catalog correction is more damaging than a missed typo.",
    ],
  },
  {
    id: "rebuild-rbac",
    title: "Implement require_manager",
    topicId: "rbac",
    difficulty: "beginner",
    brief:
      "Without looking at api/dependencies.py: write the role-guard dependency system for three roles (staff < manager < admin), such that adding a fourth role later touches exactly one line.",
    requirements: [
      "get_current_user is given — build guards on top of it",
      "manager guard admits manager AND admin; admin guard admits only admin",
      "Correct status codes: insufficient role must NOT return 401",
      "Adding a 'auditor' role between staff and manager = one-line change",
    ],
    hints: [
      "A role→level dict makes hierarchy a comparison, not a membership list",
      "One factory function make_role_guard(min_level) can generate all guards",
      "403 = known caller, refused; 401 = unknown caller",
    ],
    solutionFiles: [{ path: "api/dependencies.py", note: "compare with the shipped require_role factory + ROLE_LEVELS" }],
    solutionNotes: [
      "The shipped code (A4) IS the lattice: require_role(minimum) over ROLE_LEVELS {staff:1, manager:2, admin:3}. Compare your version against it — one detail worth stealing: anything not in the dict maps to level 0, so a garbage role fails even the staff gate instead of passing as implicit staff.",
      "If your version listed allowed roles per guard, count the edits a new role costs — that's the lesson.",
    ],
  },
  {
    id: "rebuild-jwt-flow",
    title: "Rebuild the Login → Guarded Request Flow",
    topicId: "jwt-auth",
    difficulty: "beginner",
    brief:
      "On paper or in a scratch file: write the complete auth flow — login endpoint, token minting, and per-request verification — for a FastAPI app. No peeking at api/core/security.py.",
    requirements: [
      "Password verification with a slow hash (say which and why)",
      "Token payload: what goes in, what must NEVER go in",
      "Expiry handling and the exact error semantics for missing/invalid/expired tokens",
      "State the revocation limitation and one mitigation honestly",
    ],
    hints: [
      "Three token parts: header.payload.signature — which is protected, which is public?",
      "The server stores nothing per session — that's the feature AND the bug",
    ],
    solutionFiles: [
      { path: "api/core/security.py", note: "hashing + encode/decode" },
      { path: "api/routers/auth.py", note: "login" },
      { path: "api/dependencies.py", note: "get_current_user" },
    ],
    solutionNotes: ["Diff your error handling against the real one: does yours distinguish 401 flavors? Does the real one?"],
  },
  {
    id: "rebuild-pseudo-stock",
    title: "Rebuild Pseudo-Stock in SQL",
    topicId: "sql-window-functions",
    difficulty: "intermediate",
    brief:
      "Given raw purchases and sales per (barcode, date), write the SQL producing cumulative stock position per product per day on a dense date spine — without reading step 04.",
    requirements: [
      "Dense spine: every (product × day) row even with no movement",
      "Running stock = cumulative purchases − cumulative sales up to that day",
      "Handle products whose first movement is a sale (negative stock is information, not an error)",
      "One query, window functions only — no loops, no temp tables",
    ],
    hints: [
      "generate_series + CROSS JOIN builds the spine",
      "SUM(x) OVER (PARTITION BY barcode ORDER BY date) is a running total",
      "COALESCE movement to 0 on spine rows before summing",
    ],
    solutionFiles: [{ path: "sql/rebuild_derived/04_product_stock_position.sql", note: "the shipped version" }],
    solutionNotes: [
      "Compare frame clauses: did you write ROWS explicitly or rely on the default RANGE? Now explain the difference on tied dates.",
      "Negative stock rows are the BOM Manager's origin story — repackaged products sell under barcodes never purchased.",
    ],
  },
  {
    id: "rebuild-provider-port",
    title: "Design the Provider Port",
    topicId: "provider-abstraction",
    difficulty: "intermediate",
    brief:
      "Design (types + ABC only, no adapter code) a provider abstraction that supports chat, tool calls, and usage reporting across Anthropic and OpenAI — without looking at api/ai/provider.py.",
    requirements: [
      "Neutral Message/ToolCall/ToolResult types that neither vendor's quirks leak into",
      "One method signature for completion — decide what's IN and what's deliberately OUT",
      "Explain where tool results live in your message model (this is where vendors differ most)",
      "Write one paragraph: how does a vendor-only feature (e.g. thinking budgets) enter later without if-branches in features?",
    ],
    hints: [
      "Start from what CONSUMERS need, not what vendors offer",
      "is_error on tool results — why might the port need it?",
      "Exclusions (streaming? logprobs?) are design decisions — name yours",
    ],
    solutionFiles: [{ path: "api/ai/provider.py", note: "the shipped port" }, { path: "api/ai/chat.py", note: "how the consumer uses it" }],
    solutionNotes: [
      "Score yourself: does any field in your neutral types exist only because one vendor has it? That's a leak.",
      "The shipped port excludes streaming — argue whether that was right.",
    ],
  },
  {
    id: "rebuild-tool-loop",
    title: "Rebuild the Agent Loop",
    topicId: "tool-calling",
    difficulty: "advanced",
    brief:
      "From memory, implement ChatSession.send(): the multi-round tool-execution loop with cost accumulation. Then diff against the real 100 lines.",
    requirements: [
      "Round cap; forced tool call on round one; natural termination on text-only response",
      "Tool execution with per-call exception capture returned INTO the conversation",
      "Unknown-tool handling without crashing",
      "Token/cost accumulation across rounds; history append order that a provider will accept",
    ],
    hints: [
      "The message sequence contract is strict: assistant(tool_calls) must be followed by the results message",
      "Errors are data: {'error': str(exc)} + is_error=True, loop continues",
      "What stops a model that calls the same failing tool forever? (The real one has only the round cap — improve it)",
    ],
    solutionFiles: [{ path: "api/ai/chat.py", note: "the shipped loop" }],
    solutionNotes: [
      "Your diff IS the lesson: every divergence is either your bug or a real improvement — classify each.",
      "Shipped gaps worth adding: repeated-identical-failure detection, parallel tool execution.",
    ],
  },
  {
    id: "rebuild-cache-design",
    title: "Design the Analytics Cache (Phase 1 Prep)",
    topicId: "caching-redis",
    difficulty: "advanced",
    brief:
      "Nothing to copy from — this one designs future code. Produce the one-page design for Redis caching of analytics endpoints with rebuild-triggered invalidation.",
    requirements: [
      "Key schema (endpoint + params + version?) with collision analysis",
      "Cache-aside flow incl. the stampede case (rebuild just flushed, 10 dashboards load)",
      "Invalidation: exactly how 'pipeline completed' reaches Redis — component, transport, failure mode",
      "TTL policy as backstop: value + justification",
      "What is deliberately NOT cached, and why",
    ],
    hints: [
      "Your invalidation event already exists conceptually — the outbox topic covers its delivery",
      "Stampede: single-flight lock or stale-while-revalidate — pick and defend",
      "Version-prefixed keys make 'flush namespace' an O(1) pointer bump, not a SCAN",
    ],
    solutionFiles: [{ path: "api/routers/analytics.py", note: "the endpoints your design wraps" }],
    solutionNotes: [
      "This design doc becomes the Phase 1 implementation spec — review it with your mentor before building.",
    ],
  },
];
