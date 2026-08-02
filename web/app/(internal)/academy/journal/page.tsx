"use client";

import { Card, Eyebrow } from "@/components/academy/ui";
import { CapabilityChip } from "@/components/academy/v2";
import { journalChronological } from "@/lib/academy/journal";
import { CAPABILITY_BY_ID } from "@/lib/academy/capabilities";

function List({
  label,
  items,
  tone = "neutral",
}: {
  label: string;
  items: string[];
  tone?: "neutral" | "warn" | "good";
}) {
  if (items.length === 0) return null;
  const dot =
    tone === "warn" ? "bg-rose-300" : tone === "good" ? "bg-emerald-400" : "bg-gray-300";
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-600">
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${dot}`} />
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function JournalPage() {
  const entries = journalChronological();

  return (
    <div className="max-w-4xl px-4 py-6">

      <div className="mb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          Engineering Journal
        </div>
        <h2 className="text-xl font-bold text-[#1b293e]">What it cost to find out</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Append-only. Mistakes and rejected ideas are recorded on purpose — a history that keeps
          only the successes is marketing, not memory, and the abandoned branch is usually the part
          worth remembering.
        </p>
      </div>

      <div className="space-y-4">
        {entries.map((e) => {
          const cap = CAPABILITY_BY_ID[e.capabilityId];
          return (
            <Card key={e.id} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-[#1b293e]">{e.title}</h3>
                <span className="font-mono text-[11px] text-gray-400">{e.date}</span>
              </div>

              {cap ? (
                <div className="mt-2">
                  <CapabilityChip id={cap.id} title={cap.title} status={cap.status} />
                </div>
              ) : null}

              <div className="mt-4">
                <Eyebrow>Problem</Eyebrow>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{e.problem}</p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <List label="Assumptions made" items={e.assumptions} />
                <List label="Experiments" items={e.experiments} />
                <List label="Rejected" items={e.rejectedIdeas} />
                <List label="Mistakes" items={e.mistakes} tone="warn" />
              </div>

              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <Eyebrow>Final solution</Eyebrow>
                <p className="mt-1 text-sm text-emerald-900">{e.finalSolution}</p>
              </div>

              <div className="mt-4">
                <List label="Still to improve" items={e.futureImprovements} tone="good" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
