import type { JournalEntry } from "./types";

/**
 * ENGINEERING JOURNAL — append-only memory of what building this actually felt
 * like, including the wrong turns.
 *
 * Rules:
 *  - Append, never edit. A milestone that got revisited gets a second entry;
 *    overwriting the first one destroys exactly the history worth keeping.
 *  - `mistakes` and `rejectedIdeas` are required fields, not decoration. A
 *    history that records only successes is marketing, not memory — and the
 *    rejected branch is usually the part a future reader needs most.
 *  - A Decision Record says what was decided. A Feature says what shipped.
 *    This says what it cost to find out.
 *
 * Seeded from real session history (.remember/, docs/session_*.md) rather than
 * invented retrospectives.
 */
export const JOURNAL: JournalEntry[] = [
  {
    id: "journal-set-theme-provider-wiring",
    capabilityId: "campaign-authoring",
    date: "2026-08-02",
    title: "The theme tool that silently called the wrong model",
    problem:
      "set_theme, a Campaign Studio tool that spawns a sub-agent to generate colour palettes, failed at runtime. The tool call itself looked fine; the failure was inside the nested agent, where the model slug was hardcoded rather than inherited from the caller.",
    assumptions: [
      "Assumed a sub-agent inherits the caller's provider and model. It did not — it constructed its own client from a constant.",
      "Assumed a hardcoded model id that once worked still resolved. It had been removed from the provider's catalogue.",
    ],
    experiments: [
      "Swapped the dead slug for a different hardcoded model — worked locally, still hardcoded.",
      "Swapped again after checking what the gateway actually served.",
      "Threaded provider and model through the shared state object and every call site — the fix that addressed the cause rather than the symptom.",
    ],
    rejectedIdeas: [
      "Pinning a second hardcoded model as a fallback — would have reproduced the same bug with one more layer of indirection.",
      "Catching the error and silently degrading to no theme — hides a broken feature behind a working-looking UI.",
    ],
    mistakes: [
      "Fixed the symptom twice before the cause. Two of the three changes that day were the same mistake with a different constant.",
      "The system prompt let the agent narrate success without checking whether the tool result was an error, so the failure surfaced as a confident wrong answer instead of an error.",
    ],
    finalSolution:
      "Provider and model are carried in shared state and passed explicitly into sub-agent tool calls. System prompts were hardened to require inspecting tool results before claiming success.",
    futureImprovements: [
      "Validate model ids against the provider catalogue at startup rather than at first call.",
      "A test that asserts a sub-agent uses the caller's provider — nothing currently prevents this regressing.",
    ],
  },
  {
    id: "journal-mlflow-baseline-oom",
    capabilityId: "demand-signal",
    date: "2026-05-19",
    title: "Establishing a baseline before the model that has to beat it",
    problem:
      "The weighted-moving-average baseline needed to be logged as a real, measured experiment. The first attempt pulled the full product-day table into pandas and exhausted memory.",
    assumptions: [
      "Assumed 2.9M rows would fit comfortably in memory. It did not, once feature columns were added.",
      "Assumed the baseline was a formality. It turned out to be the most useful artefact of the whole exercise.",
    ],
    experiments: [
      "Loaded everything, ran out of memory.",
      "Pushed aggregation down into SQL, returning ~392K rows instead of 2.9M.",
      "Logged the result to MLflow as the reference every future model is scored against.",
    ],
    rejectedIdeas: [
      "Sampling the data to fit in memory — a baseline computed on a sample is not the baseline the model will be compared against.",
      "Skipping the baseline and comparing models only to each other — leaves 'is any of this better than five lines of SQL?' permanently unanswered.",
    ],
    mistakes: [
      "Reached for pandas before asking whether the database could do the aggregation. The database was better at it.",
    ],
    finalSolution:
      "Aggregation pushed into SQL; the WMA baseline logged in MLflow as the number any candidate model must beat to justify its complexity.",
    futureImprovements: [
      "Promote a validated model into the pipeline as a predict step (still open — this is Phase B1).",
      "Track the baseline over time; a shifting baseline is itself a signal about the business.",
    ],
  },
  {
    id: "journal-derived-view-to-table",
    capabilityId: "data-foundation",
    date: "2026-05-19",
    title: "A view that was quietly re-running a CTE on every read",
    problem:
      "product_dimension was defined as a VIEW over several heavy CTEs. Every read recomputed the whole thing, and dashboard queries were taking around 700ms.",
    assumptions: [
      "Assumed a view was the 'clean' choice because it always reflects current data. In a layer rebuilt on a schedule, that freshness bought nothing.",
    ],
    experiments: [
      "Read the query plan and found the CTE chain re-executing per read.",
      "Converted the object to a TABLE materialised during the rebuild.",
      "Measured again: roughly 700ms down to 55ms.",
    ],
    rejectedIdeas: [
      "Adding a caching layer in the API — would have hidden the cost rather than removed it, and added an invalidation problem that did not need to exist.",
      "A materialized view with its own refresh schedule — a second schedule to keep in sync with the pipeline, for no gain over building it in the pipeline.",
    ],
    mistakes: [
      "Chose VIEW by habit rather than by reasoning about the read/write ratio. The pipeline rebuild was already a free materialisation point and went unused.",
    ],
    finalSolution:
      "Heavy-CTE derived objects are TABLEs built during the pipeline run. The rebuild is the materialisation point; freshness is defined by the pipeline, not by the read.",
    futureImprovements: [
      "Apply the same read of the query plan to the remaining step 05 views before they grow.",
    ],
  },
];

export const JOURNAL_BY_ID: Record<string, JournalEntry> = Object.fromEntries(
  JOURNAL.map((j) => [j.id, j]),
);

/** Newest first. */
export function journalChronological(): JournalEntry[] {
  return [...JOURNAL].sort((a, b) => b.date.localeCompare(a.date));
}

export function journalForCapability(capabilityId: string): JournalEntry[] {
  return journalChronological().filter((j) => j.capabilityId === capabilityId);
}
