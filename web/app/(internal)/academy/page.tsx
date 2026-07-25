"use client";

// Academy Overview — progress dashboard + "what next" + mini synapse map.

import Link from "next/link";
import { useMemo } from "react";
import { useProgress } from "@/lib/academy/progress";
import { TOPICS, recommendNext } from "@/lib/academy/topics";
import { CHALLENGES } from "@/lib/academy/challenges";
import { buildDeck } from "@/lib/academy/interview";
import { DOMAIN_META, type Domain } from "@/lib/academy/types";
import { SynapseMap } from "@/components/academy/SynapseMap";
import { Card, DifficultyBadge, Eyebrow, ProgressBar, StatusBadge } from "@/components/academy/ui";
import { ArrowRight } from "lucide-react";

const DOMAINS: Domain[] = ["data", "backend", "ml", "ai"];

export default function AcademyOverview() {
  const { hydrated, confidenceOf, state } = useProgress();
  const deckSize = useMemo(() => buildDeck().length, []);

  const stats = useMemo(() => {
    const perDomain = DOMAINS.map((d) => {
      const ts = TOPICS.filter((t) => t.domain === d);
      const score = ts.reduce(
        (acc, t) => acc + (confidenceOf(t.id) === "solid" ? 1 : confidenceOf(t.id) === "partial" ? 0.5 : 0),
        0,
      );
      return { domain: d, total: ts.length, score, ratio: ts.length ? score / ts.length : 0 };
    });
    const solid = TOPICS.filter((t) => confidenceOf(t.id) === "solid").length;
    const partial = TOPICS.filter((t) => confidenceOf(t.id) === "partial").length;
    const overall = TOPICS.length ? (solid + partial * 0.5) / TOPICS.length : 0;
    const interviewReadiness = deckSize ? state.revealed.length / deckSize : 0;
    const rebuilds = state.challengesDone.length;
    return { perDomain, solid, partial, overall, interviewReadiness, rebuilds };
  }, [confidenceOf, state, deckSize]);

  const next = useMemo(() => recommendNext(confidenceOf, 4), [confidenceOf]);

  return (
    <div className="space-y-6">
      {/* Progress row */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card className="p-4">
          <Eyebrow>Overall mastery</Eyebrow>
          <div className="mt-2 text-3xl font-bold text-[#1b293e]">
            {hydrated ? `${Math.round(stats.overall * 100)}%` : "—"}
          </div>
          <div className="mt-2"><ProgressBar value={hydrated ? stats.overall : 0} /></div>
          <p className="mt-2 text-xs text-gray-500">
            {stats.solid} owned · {stats.partial} partial · {TOPICS.length} topics
          </p>
        </Card>
        {stats.perDomain.map(({ domain, score, total, ratio }) => (
          <Card key={domain} className="p-4">
            <Eyebrow>{DOMAIN_META[domain].label}</Eyebrow>
            <div className="mt-2 text-3xl font-bold" style={{ color: DOMAIN_META[domain].color }}>
              {hydrated ? `${score % 1 === 0 ? score : score.toFixed(1)}/${total}` : "—"}
            </div>
            <div className="mt-2"><ProgressBar value={hydrated ? ratio : 0} color={DOMAIN_META[domain].color} /></div>
          </Card>
        ))}
      </div>

      {/* What next */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <Eyebrow>What should I learn next?</Eyebrow>
            <p className="mt-1 text-sm text-gray-500">
              Prerequisites met, not yet owned — in-progress topics first, then easiest.
            </p>
          </div>
          <Link href="/academy/path" className="text-sm font-medium text-[#105dff] hover:underline">
            Full learning path →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {next.map((t, i) => (
            <Link
              key={t.id}
              href={`/academy/topics/${t.id}`}
              className={`group rounded-xl border p-4 transition-all hover:shadow-md ${
                i === 0 ? "border-[#105dff] bg-blue-50/50" : "border-gray-200 bg-white hover:border-blue-200"
              }`}
            >
              {i === 0 && (
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#105dff]">
                  start here
                </div>
              )}
              <div className="text-sm font-semibold text-[#1b293e] group-hover:text-[#105dff]">
                {t.title}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-gray-500">{t.tagline}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <DifficultyBadge level={t.difficulty} />
                <StatusBadge status={t.status} />
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Synapse map */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <Eyebrow>Synapse map</Eyebrow>
            <p className="mt-1 text-sm text-gray-500">
              Your knowledge constellation. Fill = confidence, ring = domain, pulse = recommended.
            </p>
          </div>
          <Link href="/academy/graph" className="text-sm font-medium text-[#105dff] hover:underline">
            Explore →
          </Link>
        </div>
        <div className="mt-3">
          <SynapseMap confidenceOf={confidenceOf} recommendedIds={next.slice(0, 1).map((t) => t.id)} />
        </div>
      </Card>

      {/* Section shortcuts */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { href: "/academy/architecture", label: "Architecture Explorer", desc: "Click through the system map — every component's purpose, alternatives, and trade-offs." },
          { href: "/academy/features", label: "Feature Explorer", desc: "Each shipped feature: problem, flows, theory, production notes, interview angles." },
          { href: "/academy/rebuild", label: "Rebuild Mode", desc: `${CHALLENGES.length} challenges: implement it yourself, then diff against the real code. ${hydrated ? state.challengesDone.length : 0} done.` },
          { href: "/academy/interview", label: "Interview Mode", desc: `${deckSize} questions generated from YOUR code. ${hydrated ? Math.round(stats.interviewReadiness * 100) : 0}% explored.` },
          { href: "/academy/topics", label: "Theory Roadmap", desc: "Every concept hidden in the codebase — analogy first, three depth levels each." },
          { href: "/academy/roadmap", label: "Future Roadmap", desc: "Six phases ranked by learning, interview, and production value — plus rejected tech." },
        ].map((s) => (
          <Link key={s.href} href={s.href} className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1b293e] group-hover:text-[#105dff]">{s.label}</span>
              <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#105dff]" />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{s.desc}</p>
          </Link>
        ))}
      </div>

      {/* Philosophy */}
      <Card className="border-dashed p-5">
        <Eyebrow>Learning philosophy</Eyebrow>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
          The goal is not to finish AxonFlux. The goal is to become the engineer who could
          rebuild it from scratch and defend every decision in an interview. When choosing
          between shipping fast and understanding deeply — understanding wins. Mark
          confidence honestly: “I own this” means you could explain it from memory to a
          skeptical interviewer.
        </p>
      </Card>
    </div>
  );
}
