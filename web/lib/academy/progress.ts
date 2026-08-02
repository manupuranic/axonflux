"use client";

// Progress store — localStorage-backed for now. Deliberate trade-off:
// zero backend surface while the Academy stabilises. If progress ever
// needs to survive browsers/devices, promote this to an app.* table
// (app.academy_progress) behind a small router — the hook API below
// stays identical, only the persistence swaps. That migration is itself
// a documented exercise in the Academy.
//
// V2: Knowledge Rings live alongside the original 3-level confidence. The
// storage key is deliberately UNCHANGED — the persisted shape only gained a
// field, so existing saved progress survives and is migrated forward on read
// rather than reset. `confidence` is now derived from rings when rings exist,
// so nothing that still reads the old field breaks mid-migration.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Confidence, KnowledgeDebt, RingName, RingProgress } from "./types";
import { EMPTY_RINGS, RING_ORDER } from "./types";

const KEY = "axonflux-academy-progress-v1";

/** A concept untouched for this long counts as "known but forgotten". */
const STALE_AFTER_DAYS = 180;

export interface ProgressState {
  confidence: Record<string, Confidence>;
  /** Interview question ids the user has revealed. */
  revealed: string[];
  /** Challenge ids marked as completed. */
  challengesDone: string[];
  /** V2 — per-topic knowledge rings. Absent entries fall back to `confidence`. */
  rings: Record<string, RingProgress>;
}

const EMPTY: ProgressState = {
  confidence: {},
  revealed: [],
  challengesDone: [],
  rings: {},
};

/**
 * One-time forward migration for topics rated before rings existed.
 * Conservative on purpose: "solid" does not grant mastery, because the old
 * 3-level scale never asked the interview question. Claiming it would inflate
 * readiness with something the user never actually asserted.
 */
function ringsFromConfidence(c: Confidence): RingProgress {
  if (c === "solid") {
    return {
      theory: true,
      explain: true,
      implement: true,
      production: true,
      mastery: false,
      lastTouchedAt: "",
    };
  }
  if (c === "partial") {
    return {
      theory: true,
      explain: true,
      implement: false,
      production: false,
      mastery: false,
      lastTouchedAt: "",
    };
  }
  return { ...EMPTY_RINGS };
}

/** Backward derivation, so any component still reading `confidence` keeps working. */
export function confidenceFromRings(r: RingProgress): Confidence {
  if (r.mastery || r.production) return "solid";
  if (r.theory || r.explain || r.implement) return "partial";
  return "none";
}

function isStale(iso: string): boolean {
  if (!iso) return false; // never recorded — cannot claim it went stale
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return false;
  const days = (Date.now() - then) / 86_400_000;
  return days > STALE_AFTER_DAYS;
}

/**
 * Knowledge Debt — always derived, never authored. If the user had to remember
 * to flag their own weak areas, the weakest ones are exactly what would go
 * unflagged.
 *
 * The ordering matters: "implemented but not understood" is checked first
 * because it is the most dangerous state and the one a single 0–5 progress
 * integer would have hidden entirely.
 */
export function knowledgeDebt(r: RingProgress): KnowledgeDebt {
  const touched = RING_ORDER.some((k) => r[k]);
  if (!touched) return "unknown";
  if ((r.implement || r.production) && !(r.theory && r.explain)) {
    return "implemented-but-not-understood";
  }
  if (r.theory && r.explain && !r.implement) {
    return isStale(r.lastTouchedAt)
      ? "known-but-forgotten"
      : "understood-but-not-implemented";
  }
  if (isStale(r.lastTouchedAt)) return "known-but-forgotten";
  return "none";
}

function load(): ProgressState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    const confidence = parsed.confidence ?? {};
    const rings = { ...(parsed.rings ?? {}) };

    // Migrate any topic rated on the old scale that has no explicit rings yet.
    for (const [topicId, level] of Object.entries(confidence)) {
      if (!rings[topicId]) rings[topicId] = ringsFromConfidence(level);
    }

    return {
      confidence,
      revealed: parsed.revealed ?? [],
      challengesDone: parsed.challengesDone ?? [],
      rings,
    };
  } catch {
    return EMPTY;
  }
}

function save(state: ProgressState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full/blocked — progress is a convenience, never fatal.
  }
}

export function useProgress() {
  const [state, setState] = useState<ProgressState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  const setConfidence = useCallback((topicId: string, level: Confidence) => {
    setState((prev) => {
      const next = {
        ...prev,
        confidence: { ...prev.confidence, [topicId]: level },
        // Keep rings coherent: a coarse rating still moves the fine-grained
        // model, otherwise the two views of the same topic would disagree.
        rings: {
          ...prev.rings,
          [topicId]: {
            ...ringsFromConfidence(level),
            lastTouchedAt: new Date().toISOString(),
          },
        },
      };
      save(next);
      return next;
    });
  }, []);

  const ringsOf = useCallback(
    (topicId: string): RingProgress => state.rings[topicId] ?? EMPTY_RINGS,
    [state.rings],
  );

  const setRing = useCallback((topicId: string, ring: RingName, value: boolean) => {
    setState((prev) => {
      const current = prev.rings[topicId] ?? EMPTY_RINGS;
      const updated: RingProgress = {
        ...current,
        [ring]: value,
        lastTouchedAt: new Date().toISOString(),
      };
      const next = {
        ...prev,
        rings: { ...prev.rings, [topicId]: updated },
        // Mirror back to the legacy field so old consumers stay correct.
        confidence: { ...prev.confidence, [topicId]: confidenceFromRings(updated) },
      };
      save(next);
      return next;
    });
  }, []);

  const toggleRing = useCallback(
    (topicId: string, ring: RingName) => {
      const current = state.rings[topicId] ?? EMPTY_RINGS;
      setRing(topicId, ring, !current[ring]);
    },
    [state.rings, setRing],
  );

  const toggleRevealed = useCallback((qId: string) => {
    setState((prev) => {
      const has = prev.revealed.includes(qId);
      const next = {
        ...prev,
        revealed: has ? prev.revealed.filter((x) => x !== qId) : [...prev.revealed, qId],
      };
      save(next);
      return next;
    });
  }, []);

  const toggleChallenge = useCallback((cId: string) => {
    setState((prev) => {
      const has = prev.challengesDone.includes(cId);
      const next = {
        ...prev,
        challengesDone: has
          ? prev.challengesDone.filter((x) => x !== cId)
          : [...prev.challengesDone, cId],
      };
      save(next);
      return next;
    });
  }, []);

  const confidenceOf = useCallback(
    (topicId: string): Confidence => {
      const rings = state.rings[topicId];
      if (rings) return confidenceFromRings(rings);
      return state.confidence[topicId] ?? "none";
    },
    [state.confidence, state.rings],
  );

  const debtOf = useCallback(
    (topicId: string): KnowledgeDebt => knowledgeDebt(state.rings[topicId] ?? EMPTY_RINGS),
    [state.rings],
  );

  /** Topics carrying real debt, worst first — feeds the home page's weak-spots panel. */
  const debtTopics = useMemo(() => {
    const rank: Record<KnowledgeDebt, number> = {
      "implemented-but-not-understood": 0,
      "known-but-forgotten": 1,
      "understood-but-not-implemented": 2,
      unknown: 3,
      none: 4,
    };
    return Object.entries(state.rings)
      .map(([topicId, r]) => ({ topicId, debt: knowledgeDebt(r) }))
      .filter((d) => d.debt !== "none" && d.debt !== "unknown")
      .sort((a, b) => rank[a.debt] - rank[b.debt]);
  }, [state.rings]);

  return {
    state,
    hydrated,
    setConfidence,
    toggleRevealed,
    toggleChallenge,
    confidenceOf,
    // V2
    ringsOf,
    setRing,
    toggleRing,
    debtOf,
    debtTopics,
  };
}
