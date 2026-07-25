"use client";

// Progress store — localStorage-backed for now. Deliberate trade-off:
// zero backend surface while the Academy stabilises. If progress ever
// needs to survive browsers/devices, promote this to an app.* table
// (app.academy_progress) behind a small router — the hook API below
// stays identical, only the persistence swaps. That migration is itself
// a documented exercise in the Academy.

import { useCallback, useEffect, useState } from "react";
import type { Confidence } from "./types";

const KEY = "axonflux-academy-progress-v1";

export interface ProgressState {
  confidence: Record<string, Confidence>;
  /** Interview question ids the user has revealed. */
  revealed: string[];
  /** Challenge ids marked as completed. */
  challengesDone: string[];
}

const EMPTY: ProgressState = { confidence: {}, revealed: [], challengesDone: [] };

function load(): ProgressState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return {
      confidence: parsed.confidence ?? {},
      revealed: parsed.revealed ?? [],
      challengesDone: parsed.challengesDone ?? [],
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
      };
      save(next);
      return next;
    });
  }, []);

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
    (topicId: string): Confidence => state.confidence[topicId] ?? "none",
    [state.confidence],
  );

  return { state, hydrated, setConfidence, toggleRevealed, toggleChallenge, confidenceOf };
}
