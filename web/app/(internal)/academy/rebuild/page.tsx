"use client";

// Rebuild Mode — implementation hidden until you've tried it yourself.
// The diff between your attempt and the shipped code is the lesson.

import Link from "next/link";
import { useState } from "react";
import { CHALLENGES } from "@/lib/academy/challenges";
import { TOPIC_BY_ID } from "@/lib/academy/topics";
import { useProgress } from "@/lib/academy/progress";
import { Card, DifficultyBadge, Eyebrow, FileRefList } from "@/components/academy/ui";
import { CheckCircle2, Circle, Eye, EyeOff, Lightbulb } from "lucide-react";

export default function RebuildPage() {
  const { state, toggleChallenge } = useProgress();
  const [openHints, setOpenHints] = useState<Record<string, number>>({});
  const [revealedSolutions, setRevealedSolutions] = useState<Set<string>>(new Set());

  const showNextHint = (id: string) =>
    setOpenHints((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));

  const revealSolution = (id: string) =>
    setRevealedSolutions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Rebuild mode</Eyebrow>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          The real test of ownership: implement it yourself with the original hidden,
          then diff against the shipped code. Hints unlock one at a time — resist them.
          Mark a challenge done only after writing the comparison notes.
        </p>
      </div>

      {CHALLENGES.map((c) => {
        const done = state.challengesDone.includes(c.id);
        const hintsShown = openHints[c.id] ?? 0;
        const solutionOpen = revealedSolutions.has(c.id);
        const topic = TOPIC_BY_ID[c.topicId];
        return (
          <Card key={c.id} className={`p-5 ${done ? "border-emerald-200 bg-emerald-50/30" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[#1b293e]">{c.title}</h2>
                  <DifficultyBadge level={c.difficulty} />
                </div>
                {topic && (
                  <Link href={`/academy/topics/${c.topicId}`} className="mt-0.5 inline-block font-mono text-[11px] text-gray-400 hover:text-[#105dff]">
                    theory: {topic.title} →
                  </Link>
                )}
              </div>
              <button
                onClick={() => toggleChallenge(c.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  done
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                {done ? "Completed" : "Mark complete"}
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-gray-700">{c.brief}</p>

            <div className="mt-3">
              <Eyebrow>Requirements</Eyebrow>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {c.requirements.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>

            {/* Progressive hints */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {hintsShown < c.hints.length && (
                <button
                  onClick={() => showNextHint(c.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <Lightbulb className="h-4 w-4" />
                  Hint {hintsShown + 1} of {c.hints.length}
                </button>
              )}
              <button
                onClick={() => revealSolution(c.id)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {solutionOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {solutionOpen ? "Hide the real implementation" : "Reveal the real implementation"}
              </button>
            </div>

            {hintsShown > 0 && (
              <ol className="mt-3 space-y-1.5">
                {c.hints.slice(0, hintsShown).map((h, i) => (
                  <li key={i} className="rounded-lg bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
                    <span className="font-mono text-[11px] text-amber-500">hint {i + 1} · </span>{h}
                  </li>
                ))}
              </ol>
            )}

            {solutionOpen && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-slate-50 p-4">
                <Eyebrow>The shipped implementation</Eyebrow>
                <div className="mt-2"><FileRefList files={c.solutionFiles} /></div>
                <div className="mt-3">
                  <Eyebrow>Comparison notes</Eyebrow>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
                    {c.solutionNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
