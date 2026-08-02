"use client";

import Link from "next/link";
import { Card, Eyebrow } from "@/components/academy/ui";
import { CapabilityChip } from "@/components/academy/v2";
import { decisionsChronological } from "@/lib/academy/decisions";
import { CAPABILITY_BY_ID } from "@/lib/academy/capabilities";
import { DNA_BY_ID } from "@/lib/academy/dna";

export default function DecisionsPage() {
  const decisions = decisionsChronological();

  return (
    <div className="max-w-4xl px-4 py-6">

      <div className="mb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          Decision History
        </div>
        <h2 className="text-xl font-bold text-[#1b293e]">Why it is the way it is</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Newest first. Each entry records what was tried first, what was rejected and why, and
          what it cost. The full text of record stays in the ADR markdown — this view exists to
          connect a decision to the capability and components it shaped.
        </p>
      </div>

      <div className="space-y-4">
        {decisions.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-[#1b293e]">{d.title}</h3>
              <span className="font-mono text-[11px] uppercase tracking-wider text-gray-400">
                {d.date} · {d.status}
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-gray-600">{d.context}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Eyebrow>First approach</Eyebrow>
                <p className="mt-1 text-sm text-gray-600">{d.originalApproach}</p>
              </div>
              <div>
                <Eyebrow>What was chosen</Eyebrow>
                <p className="mt-1 text-sm text-gray-600">{d.finalDecision}</p>
              </div>
            </div>

            <div className="mt-4">
              <Eyebrow>Rejected</Eyebrow>
              <ul className="mt-1.5 space-y-1.5">
                {d.alternativesConsidered.map((a) => (
                  <li key={a} className="flex gap-2 text-sm text-gray-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <Eyebrow>Trade-off accepted</Eyebrow>
                <p className="mt-1 text-sm text-amber-900">{d.tradeoffs}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <Eyebrow>Lesson</Eyebrow>
                <p className="mt-1 text-sm text-emerald-900">{d.lessonsLearned}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {d.capabilityIds.map((c) => {
                const cap = CAPABILITY_BY_ID[c];
                return cap ? (
                  <CapabilityChip key={c} id={c} title={cap.title} status={cap.status} />
                ) : null;
              })}
              {d.principleRefs.map((p) => {
                const pr = DNA_BY_ID[p];
                return pr ? (
                  <Link
                    key={p}
                    href="/academy/dna"
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
                  >
                    {pr.statement}
                  </Link>
                ) : null;
              })}
            </div>

            {d.adrFile ? (
              <p className="mt-3 font-mono text-[11px] text-gray-400">
                Full record: <code className="text-gray-500">{d.adrFile}</code>
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
