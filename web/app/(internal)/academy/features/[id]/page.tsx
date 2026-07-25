"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FEATURE_BY_ID } from "@/lib/academy/features";
import { TOPIC_BY_ID } from "@/lib/academy/topics";
import { useProgress } from "@/lib/academy/progress";
import { RevealCard } from "@/components/academy/RevealCard";
import { Card, Eyebrow, FileRefList, LabeledSection, TopicChip } from "@/components/academy/ui";
import { ArrowDown } from "lucide-react";

export default function FeaturePage() {
  const params = useParams<{ id: string }>();
  const feature = FEATURE_BY_ID[params.id];
  const { state, toggleRevealed, confidenceOf } = useProgress();

  if (!feature) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-600">No feature named “{params.id}”.</p>
        <Link href="/academy/features" className="mt-2 inline-block text-sm font-medium text-[#105dff] hover:underline">
          Back to features
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>Feature case study</Eyebrow>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1b293e]">{feature.title}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>Problem it solves</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{feature.problem}</p>
        </Card>
        <Card className="p-5">
          <Eyebrow>Business value</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{feature.value}</p>
        </Card>
      </div>

      {/* Architecture chain */}
      <Card className="p-5">
        <Eyebrow>Architecture</Eyebrow>
        <div className="mt-3 space-y-0">
          {feature.architecture.map((step, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown className="h-3.5 w-3.5 text-gray-300" />
                </div>
              )}
              <div className="rounded-lg border border-gray-100 bg-slate-50 px-3 py-2 text-sm text-gray-700">
                {step}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Flows */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <Eyebrow>Code flow</Eyebrow>
          <ol className="mt-3 space-y-3">
            {feature.codeFlow.map((s, i) => (
              <li key={i} className="text-sm">
                <div className="font-semibold text-[#1b293e]">
                  <span className="mr-1.5 font-mono text-xs text-gray-400">{i + 1}.</span>
                  {s.step}
                </div>
                <p className="mt-0.5 text-gray-600">{s.detail}</p>
                {s.file && (
                  <code className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                    {s.file}
                  </code>
                )}
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <Eyebrow>Database flow</Eyebrow>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-gray-700">
            {feature.dbFlow.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Card>
        <Card className="p-5">
          <Eyebrow>API flow</Eyebrow>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-gray-700">
            {feature.apiFlow.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Card>
      </div>

      {/* Theory required */}
      <Card className="p-5">
        <Eyebrow>Theory this feature exercises</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {feature.theory
            .filter((t) => TOPIC_BY_ID[t])
            .map((t) => (
              <TopicChip key={t} id={t} title={TOPIC_BY_ID[t].title} confidence={confidenceOf(t)} />
            ))}
        </div>
      </Card>

      {/* Production + improvements */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>Production considerations</Eyebrow>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-gray-700">
            {feature.production.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Card>
        <Card className="p-5">
          <Eyebrow>Possible improvements</Eyebrow>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-gray-700">
            {feature.improvements.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <LabeledSection label="Key files">
          <FileRefList files={feature.files} />
        </LabeledSection>
      </Card>

      {feature.interview.length > 0 && (
        <div>
          <Eyebrow>Interview angles</Eyebrow>
          <div className="mt-2 space-y-2">
            {feature.interview.map((qa, i) => {
              const id = `f-${feature.id}-${i}`;
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
    </div>
  );
}
