"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Eyebrow, FileRefList, LabeledSection, TopicChip } from "@/components/academy/ui";
import { CapabilityChip, CapabilityStatusBadge, CivBadge, KnowledgeRings } from "@/components/academy/v2";
import { CAPABILITY_BY_ID } from "@/lib/academy/capabilities";
import { TOPIC_BY_ID } from "@/lib/academy/topics";
import { FEATURES } from "@/lib/academy/features";
import { ARCH_NODES } from "@/lib/academy/architecture";
import { CHALLENGES } from "@/lib/academy/challenges";
import { DECISION_BY_ID } from "@/lib/academy/decisions";
import { JOURNAL_BY_ID } from "@/lib/academy/journal";
import { DNA_BY_ID } from "@/lib/academy/dna";
import { useProgress } from "@/lib/academy/progress";

export default function CapabilityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cap = CAPABILITY_BY_ID[id];
  const { ringsOf, confidenceOf } = useProgress();

  if (!cap) notFound();

  const feature = cap.featureId ? FEATURES.find((f) => f.id === cap.featureId) : undefined;
  const nodes = ARCH_NODES.filter((n) => cap.archNodeIds.includes(n.id));
  const challenges = CHALLENGES.filter((c) => cap.rebuildChallengeIds.includes(c.id));
  const decisions = cap.decisionRecordIds.map((d) => DECISION_BY_ID[d]).filter(Boolean);
  const entries = cap.journalEntryIds.map((j) => JOURNAL_BY_ID[j]).filter(Boolean);
  const principles = cap.principleRefs.map((p) => DNA_BY_ID[p]).filter(Boolean);

  return (
    <div className="max-w-5xl px-4 py-6">

      <Link
        href="/academy/capabilities"
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400 hover:text-gray-600"
      >
        ← All capabilities
      </Link>

      {/* Mission brief */}
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CapabilityStatusBadge status={cap.status} />
          {cap.civilizations.map((c) => (
            <CivBadge key={c} civ={c} size="xs" />
          ))}
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#1b293e]">{cap.title}</h2>
        <p className="mt-1.5 text-base text-gray-700">{cap.mission}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <LabeledSection label="Why it matters">
            <p className="text-sm leading-relaxed text-gray-600">{cap.businessValue}</p>
          </LabeledSection>
          <LabeledSection label="Expected outcome">
            <p className="text-sm leading-relaxed text-gray-600">{cap.expectedOutcome}</p>
          </LabeledSection>
        </div>

        {cap.blockedBy ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <Eyebrow>Blocked by</Eyebrow>
            <p className="mt-1 text-sm text-rose-800">{cap.blockedBy}</p>
          </div>
        ) : null}
      </div>

      {/* Prereqs / unlocks */}
      {(cap.prereqCapabilities.length > 0 || cap.unlocksCapabilities.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {cap.prereqCapabilities.length > 0 && (
            <Card className="p-4">
              <Eyebrow>Requires</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cap.prereqCapabilities.map((p) => {
                  const c = CAPABILITY_BY_ID[p];
                  return c ? (
                    <CapabilityChip key={p} id={p} title={c.title} status={c.status} />
                  ) : null;
                })}
              </div>
            </Card>
          )}
          {cap.unlocksCapabilities.length > 0 && (
            <Card className="p-4">
              <Eyebrow>Unlocks</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cap.unlocksCapabilities.map((u) => {
                  const c = CAPABILITY_BY_ID[u];
                  return c ? (
                    <CapabilityChip key={u} id={u} title={c.title} status={c.status} />
                  ) : null;
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Required knowledge, with live ring state */}
      <Card className="mt-4 p-4">
        <Eyebrow>Required knowledge</Eyebrow>
        <div className="mt-3 space-y-3">
          {cap.requiredTopicIds.map((tid) => {
            const t = TOPIC_BY_ID[tid];
            if (!t) return null;
            return (
              <div key={tid} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/academy/topics/${tid}`}
                    className="text-sm font-medium text-[#1b293e] hover:text-[#105dff]"
                  >
                    {t.title}
                  </Link>
                  <KnowledgeRings rings={ringsOf(tid)} compact />
                </div>
                <p className="mt-1 text-xs text-gray-500">{t.tagline}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Implementation */}
      {feature || nodes.length > 0 ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Implementation</Eyebrow>
          {feature ? (
            <div className="mt-2">
              <Link
                href={`/academy/features/${feature.id}`}
                className="text-sm font-medium text-[#105dff] hover:underline"
              >
                Case study: {feature.title} →
              </Link>
              <div className="mt-3">
                <FileRefList files={feature.files} />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              Not built yet — no implementation to point at. This section fills itself in when the
              capability ships and a case study is written.
            </p>
          )}
          {nodes.length > 0 ? (
            <div className="mt-4">
              <Eyebrow>Components involved</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nodes.map((n) => (
                  <Link
                    key={n.id}
                    href="/academy/atlas"
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Principles */}
      {principles.length > 0 ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Principles this embodies</Eyebrow>
          <ul className="mt-2 space-y-2">
            {principles.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href="/academy/dna" className="font-medium text-[#1b293e] hover:text-[#105dff]">
                  {p.statement}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Decisions */}
      {decisions.length > 0 ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Decisions behind it</Eyebrow>
          <div className="mt-2 space-y-3">
            {decisions.map((d) => (
              <div key={d.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-[#1b293e]">{d.title}</span>
                  <span className="font-mono text-[11px] text-gray-400">{d.date}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{d.finalDecision}</p>
                <Link
                  href="/academy/decisions"
                  className="mt-1.5 inline-block text-xs text-[#105dff] hover:underline"
                >
                  Full decision record →
                </Link>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Journal */}
      {entries.length > 0 ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Engineering journal</Eyebrow>
          <div className="mt-2 space-y-2">
            {entries.map((e) => (
              <Link
                key={e.id}
                href="/academy/journal"
                className="block rounded-lg border border-gray-200 p-3 hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-[#1b293e]">{e.title}</span>
                  <span className="font-mono text-[11px] text-gray-400">{e.date}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{e.problem}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Interview */}
      {cap.interview.length > 0 ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Interview</Eyebrow>
          <div className="mt-2 space-y-3">
            {cap.interview.map((qa) => (
              <details key={qa.q} className="group rounded-lg border border-gray-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-[#1b293e]">
                  {qa.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{qa.a}</p>
              </details>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Rebuild */}
      {challenges.length > 0 ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Rebuild challenge</Eyebrow>
          <div className="mt-2 space-y-2">
            {challenges.map((c) => (
              <Link
                key={c.id}
                href="/academy/rebuild"
                className="block rounded-lg border border-gray-200 p-3 hover:border-gray-300 hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-[#1b293e]">{c.title}</span>
                <p className="mt-1 text-sm text-gray-600">{c.brief}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Related topics footer */}
      <div className="mt-6">
        <Eyebrow>Jump to theory</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cap.requiredTopicIds.map((tid) => {
            const t = TOPIC_BY_ID[tid];
            return t ? (
              <TopicChip key={tid} id={tid} title={t.title} confidence={confidenceOf(tid)} />
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
