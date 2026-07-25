"use client";

// Topic page — the Academy's core lesson unit.
// Order is pedagogy: position → analogy → problem → three depth levels →
// project usage → mentor panel → interview → exercises → confidence.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { TOPIC_BY_ID } from "@/lib/academy/topics";
import { useProgress } from "@/lib/academy/progress";
import { YouAreHere } from "@/components/academy/YouAreHere";
import { ConfidenceControl } from "@/components/academy/ConfidenceControl";
import { RevealCard } from "@/components/academy/RevealCard";
import {
  Card, DifficultyBadge, DomainBadge, Eyebrow, FileRefList, LabeledSection, StatusBadge,
} from "@/components/academy/ui";
import { AlertTriangle, Building2, CheckCircle2, Lightbulb, XCircle } from "lucide-react";

const LEVELS = [
  { key: "l1", label: "Level 1 · Intuition", time: "5 min" },
  { key: "l2", label: "Level 2 · Mechanism", time: "30 min" },
  { key: "l3", label: "Level 3 · Deep Dive", time: "2 hrs" },
] as const;

export default function TopicPage() {
  const params = useParams<{ id: string }>();
  const topic = TOPIC_BY_ID[params.id];
  const { confidenceOf, setConfidence, state, toggleRevealed } = useProgress();
  const [level, setLevel] = useState<"l1" | "l2" | "l3">("l1");

  if (!topic) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-600">No topic named “{params.id}”.</p>
        <Link href="/academy/topics" className="mt-2 inline-block text-sm font-medium text-[#105dff] hover:underline">
          Back to the theory roadmap
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <YouAreHere topic={topic} confidenceOf={confidenceOf} />

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <DomainBadge domain={topic.domain} />
          <DifficultyBadge level={topic.difficulty} />
          <StatusBadge status={topic.status} />
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1b293e]">{topic.title}</h1>
        <p className="mt-1 font-mono text-sm text-gray-500">“{topic.tagline}”</p>
      </div>

      {/* Analogy — always first, per learning style */}
      <Card className="border-amber-200 bg-amber-50/60 p-5">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <Eyebrow>Start with the analogy</Eyebrow>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-800">{topic.analogy}</p>
          </div>
        </div>
      </Card>

      {/* Problem-first framing */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>The problem that invented it</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{topic.problem}</p>
        </Card>
        <Card className="p-5">
          <Eyebrow>What breaks without it</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{topic.withoutIt}</p>
        </Card>
      </div>

      {/* Three-level explanation */}
      <Card className="p-5">
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((l) => {
            const empty = l.key !== "l1" && (l.key === "l2" ? topic.level2.length === 0 : topic.level3.length === 0);
            return (
              <button
                key={l.key}
                onClick={() => setLevel(l.key)}
                disabled={empty}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  level === l.key
                    ? "bg-[#105dff] text-white"
                    : empty
                      ? "cursor-not-allowed text-gray-300"
                      : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {l.label} <span className="ml-1 text-xs opacity-70">{l.time}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-4">
          {level === "l1" &&
            topic.level1.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-gray-700">{p}</p>
            ))}
          {level === "l2" &&
            topic.level2.map((s, i) => (
              <section key={i}>
                <h3 className="text-sm font-semibold text-[#1b293e]">{s.heading}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-700">{s.body}</p>
              </section>
            ))}
          {level === "l3" &&
            topic.level3.map((s, i) => (
              <section key={i}>
                <h3 className="text-sm font-semibold text-[#1b293e]">{s.heading}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-700">{s.body}</p>
              </section>
            ))}
          {topic.status === "planned" && level === "l1" && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Frontier topic: Levels 2–3 are written alongside the roadmap phase that
              builds it — theory lands with the code it explains.
            </p>
          )}
        </div>
      </Card>

      {/* Context: project / industry / when not */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#105dff]" />
            <Eyebrow>How AxonFlux uses it</Eyebrow>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{topic.axonflux}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-500" />
            <Eyebrow>How companies use it</Eyebrow>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{topic.companies}</p>
        </Card>
        <Card className="border-rose-100 p-5">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-rose-500" />
            <Eyebrow>When NOT to use it</Eyebrow>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{topic.whenNot}</p>
        </Card>
      </div>

      {/* Mentor panel */}
      <Card className="p-5">
        <Eyebrow>Mentor panel</Eyebrow>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm font-semibold text-emerald-700">Understand deeply</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-gray-700">
              {topic.mentor.deep.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-500">Safe to abstract away</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-gray-600">
              {topic.mentor.abstract.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Beginner mistakes
            </div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-gray-700">
              {topic.mentor.mistakes.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        </div>
      </Card>

      {/* Files */}
      <Card className="p-5">
        <LabeledSection label="Where it lives in the code">
          <FileRefList files={topic.files} />
        </LabeledSection>
      </Card>

      {/* Interview */}
      {topic.interview.length > 0 && (
        <div>
          <Eyebrow>Interview questions on this topic</Eyebrow>
          <div className="mt-2 space-y-2">
            {topic.interview.map((qa, i) => {
              const id = `t-${topic.id}-${i}`;
              return (
                <RevealCard
                  key={id}
                  question={qa.q}
                  answer={qa.a}
                  revealed={state.revealed.includes(id)}
                  onToggle={() => toggleRevealed(id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Exercises */}
      <Card className="p-5">
        <Eyebrow>Exercises — do these before marking “I own this”</Eyebrow>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-gray-700">
          {topic.exercises.map((e, i) => <li key={i}>{e}</li>)}
        </ol>
      </Card>

      {/* Confidence */}
      <Card className="p-5">
        <Eyebrow>Your confidence — be honest, the learning path adapts to this</Eyebrow>
        <div className="mt-3">
          <ConfidenceControl
            value={confidenceOf(topic.id)}
            onChange={(c) => setConfidence(topic.id, c)}
          />
        </div>
      </Card>
    </div>
  );
}
