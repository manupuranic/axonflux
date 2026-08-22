"use client";

// Academy Command Center — the page that answers "what do I do next?" before
// you have to think about it. V2: mission first, civilization ages second,
// weak spots third. Deliberately no percentages: people remember milestones,
// not 62%.

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useProgress } from "@/lib/academy/progress";
import { TOPICS, TOPIC_BY_ID, recommendNext } from "@/lib/academy/topics";
import { CHALLENGES } from "@/lib/academy/challenges";
import { buildDeck } from "@/lib/academy/interview";
import { CAPABILITIES, CAPABILITY_BY_ID, currentMission } from "@/lib/academy/capabilities";
import {
  CIVILIZATION_ORDER,
  civilizationState,
  nodesOf,
  recommendNextNode,
} from "@/lib/academy/civilization";
import { journalChronological } from "@/lib/academy/journal";
import { decisionsChronological } from "@/lib/academy/decisions";
import { CIVILIZATION_META, DEBT_META } from "@/lib/academy/types";
import { Card, Eyebrow } from "@/components/academy/ui";
import {
  CapabilityChip,
  CapabilityStatusBadge,
  CivBadge,
  DebtBadge,
  Milestone,
} from "@/components/academy/v2";

export default function AcademyCommandCenter() {
  const { hydrated, ringsOf, confidenceOf, debtTopics, state } = useProgress();

  const mission = useMemo(() => currentMission(), []);
  const nextNode = useMemo(() => (hydrated ? recommendNextNode(ringsOf) : undefined), [hydrated, ringsOf]);
  const nextTopics = useMemo(() => recommendNext(confidenceOf, 3), [confidenceOf]);

  const civStates = useMemo(
    () =>
      CIVILIZATION_ORDER.map((c) => ({
        id: c,
        nodes: nodesOf(c).length,
        state: hydrated ? civilizationState(c, ringsOf) : null,
      })),
    [hydrated, ringsOf],
  );

  const built = CAPABILITIES.filter((c) => c.status === "built").length;
  const agesTotal = civStates.reduce((a, c) => a + (c.state?.currentAge ?? 0), 0);
  const deckSize = useMemo(() => buildDeck().length, []);
  const masteredCount = useMemo(
    () => (hydrated ? TOPICS.filter((t) => ringsOf(t.id).mastery).length : 0),
    [hydrated, ringsOf],
  );

  const recentJournal = journalChronological().slice(0, 2);
  const recentDecision = decisionsChronological()[0];

  return (
    <div className="px-4 py-6">
      {/* ── Today's mission ─────────────────────────────────────────── */}
      {mission ? (
        <div className="rounded-2xl border border-orange-200 bg-linear-to-br from-orange-50 to-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-orange-700">
              Today&rsquo;s mission
            </span>
            <CapabilityStatusBadge status={mission.status} />
          </div>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-[#1b293e]">
            {mission.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-700">{mission.mission}</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Eyebrow>Knowledge required</Eyebrow>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {mission.requiredTopicIds.map((id) => {
                  const t = TOPIC_BY_ID[id];
                  if (!t) return null;
                  const done = hydrated && ringsOf(id).implement;
                  return (
                    <Link
                      key={id}
                      href={`/academy/topics/${id}`}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"
                      }`}
                    >
                      {done ? "✓ " : ""}
                      {t.title}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div>
              <Eyebrow>Expected outcome</Eyebrow>
              <p className="mt-1.5 text-sm text-gray-600">{mission.expectedOutcome}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`/academy/capabilities/${mission.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1b293e] px-3 py-2 text-sm font-medium text-white hover:bg-[#2a3b56]"
            >
              Open mission <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            {mission.unlocksCapabilities.length > 0 ? (
              <span className="text-sm text-gray-500">
                unlocks{" "}
                {mission.unlocksCapabilities
                  .map((u) => CAPABILITY_BY_ID[u]?.title ?? u)
                  .join(" · ")}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Civilization index ──────────────────────────────────────── */}
      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Eyebrow>Civilization index</Eyebrow>
            <p className="text-sm text-gray-500">
              {agesTotal > 0
                ? `${agesTotal} ages progressed across ${civStates.filter((c) => (c.state?.currentAge ?? 0) > 0).length} civilizations`
                : "Age I in progress — nothing complete yet"}
            </p>
          </div>
          <Link
            href="/academy/civilization"
            className="text-sm font-medium text-[#105dff] hover:underline"
          >
            Open the map →
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {civStates.map((c) => {
            const meta = CIVILIZATION_META[c.id];
            return (
              <Link
                key={c.id}
                href="/academy/civilization"
                className="rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-gray-300 hover:shadow-sm"
              >
                <span className="block text-sm font-semibold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="mt-1 block font-mono text-[11px] uppercase tracking-wider text-gray-400">
                  {c.nodes === 0
                    ? "not written yet"
                    : c.state && c.state.currentAge > 0
                      ? `Age ${c.state.currentAge}`
                      : "Age I"}
                </span>
                {c.nodes > 0 ? (
                  <span className="mt-2 flex gap-0.5">
                    {Array.from({ length: c.nodes }).map((_, i) => (
                      <span
                        key={i}
                        className="h-1.5 flex-1 rounded-full"
                        style={{
                          backgroundColor:
                            i < (c.state?.reached.length ?? 0) ? meta.color : "#e5e7eb",
                        }}
                      />
                    ))}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Next unlock + weak spots ────────────────────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <Eyebrow>Next unlock</Eyebrow>
          {nextNode ? (
            <>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                <span className="text-base font-semibold text-[#1b293e]">{nextNode.title}</span>
                <CivBadge civ={nextNode.civilization} size="xs" />
              </div>
              <p className="mt-1 text-sm text-gray-600">{nextNode.unlocks}</p>
              <div className="mt-3 space-y-1.5">
                {nextNode.topicIds.map((id) => {
                  const t = TOPIC_BY_ID[id];
                  const has = hydrated && ringsOf(id)[nextNode.minRing];
                  return t ? (
                    <Link
                      key={id}
                      href={`/academy/topics/${id}`}
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#105dff]"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${has ? "bg-emerald-500" : "bg-gray-300"}`}
                      />
                      {t.title}
                    </Link>
                  ) : null;
                })}
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-gray-500">
              Every unlocked milestone is reached. Open the map to see what is still locked.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <Eyebrow>Where understanding is weak</Eyebrow>
          {hydrated && debtTopics.length > 0 ? (
            <div className="mt-2 space-y-2">
              {debtTopics.slice(0, 5).map((d) => {
                const t = TOPIC_BY_ID[d.topicId];
                return t ? (
                  <Link
                    key={d.topicId}
                    href={`/academy/topics/${d.topicId}`}
                    className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 p-2 hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[#1b293e]">{t.title}</span>
                      <span className="block text-xs text-gray-500">{DEBT_META[d.debt].hint}</span>
                    </span>
                    <DebtBadge debt={d.debt} />
                  </Link>
                ) : null;
              })}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-gray-500">
              Nothing flagged yet. Debt appears once you start marking rings — especially anything
              you have implemented but cannot explain.
            </p>
          )}
        </Card>
      </div>

      {/* ── Suggested study ─────────────────────────────────────────── */}
      <div className="mt-6">
        <Eyebrow>Today&rsquo;s suggested learning</Eyebrow>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {nextTopics.map((t) => (
            <Link
              key={t.id}
              href={`/academy/topics/${t.id}`}
              className="group rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-gray-300 hover:shadow-sm"
            >
              <span className="block text-sm font-semibold text-[#1b293e] group-hover:text-[#105dff]">
                {t.title}
              </span>
              <span className="mt-1 block text-xs text-gray-500">{t.tagline}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Standing counts ─────────────────────────────────────────── */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <Eyebrow>Capabilities</Eyebrow>
          <div className="mt-1">
            <Milestone done={built} total={CAPABILITIES.length} noun="built" />
          </div>
          <Link
            href="/academy/capabilities"
            className="mt-2 inline-block text-xs text-[#105dff] hover:underline"
          >
            See all →
          </Link>
        </Card>
        <Card className="p-4">
          <Eyebrow>Interview-ready</Eyebrow>
          <div className="mt-1">
            <Milestone done={masteredCount} total={TOPICS.length} noun="topics" />
          </div>
          <Link
            href="/academy/interview"
            className="mt-2 inline-block text-xs text-[#105dff] hover:underline"
          >
            {deckSize} questions →
          </Link>
        </Card>
        <Card className="p-4">
          <Eyebrow>Rebuilt from memory</Eyebrow>
          <div className="mt-1">
            <Milestone
              done={state.challengesDone.length}
              total={CHALLENGES.length}
              noun="challenges"
            />
          </div>
          <Link
            href="/academy/rebuild"
            className="mt-2 inline-block text-xs text-[#105dff] hover:underline"
          >
            Rebuild mode →
          </Link>
        </Card>
        <Card className="p-4">
          <Eyebrow>Latest decision</Eyebrow>
          {recentDecision ? (
            <>
              <p className="mt-1 text-sm font-medium text-[#1b293e]">{recentDecision.title}</p>
              <Link
                href="/academy/decisions"
                className="mt-2 inline-block text-xs text-[#105dff] hover:underline"
              >
                Decision history →
              </Link>
            </>
          ) : null}
        </Card>
      </div>

      {/* ── Recent discoveries ──────────────────────────────────────── */}
      {recentJournal.length > 0 ? (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <Eyebrow>Recent discoveries</Eyebrow>
            <Link href="/academy/journal" className="text-sm text-[#105dff] hover:underline">
              Engineering journal →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentJournal.map((j) => (
              <article
                key={j.id}
                className="rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href="/academy/journal"
                    className="text-sm font-semibold text-[#1b293e] hover:text-[#105dff] hover:underline"
                  >
                    {j.title}
                  </Link>
                  <span className="font-mono text-[11px] text-gray-400">{j.date}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">{j.problem}</p>
                <div className="mt-2">
                  {CAPABILITY_BY_ID[j.capabilityId] ? (
                    <CapabilityChip
                      id={j.capabilityId}
                      title={CAPABILITY_BY_ID[j.capabilityId].title}
                      status={CAPABILITY_BY_ID[j.capabilityId].status}
                    />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
