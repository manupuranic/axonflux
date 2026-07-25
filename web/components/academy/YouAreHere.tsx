"use client";

import Link from "next/link";
import type { Confidence, Topic } from "@/lib/academy/types";
import { DOMAIN_META } from "@/lib/academy/types";
import { TOPIC_BY_ID, ancestryOf } from "@/lib/academy/topics";
import { ConfidenceDot, Eyebrow } from "./ui";

/**
 * "You are here" — every topic page opens with this: a mono ancestry tree,
 * prerequisite status, and what this topic unlocks. The anti-lost device.
 */
export function YouAreHere({
  topic,
  confidenceOf,
}: {
  topic: Topic;
  confidenceOf: (id: string) => Confidence;
}) {
  const chain = ancestryOf(topic.id);
  const domain = DOMAIN_META[topic.domain];
  const unlocks = topic.unlocks.filter((u) => TOPIC_BY_ID[u]);

  return (
    <div className="rounded-xl border border-gray-200 bg-slate-50/70 p-4">
      <Eyebrow>You are here</Eyebrow>
      <pre className="mt-2 overflow-x-auto font-mono text-[12.5px] leading-6 text-slate-700">
        <span className="text-slate-400">{"AI Engineering Curriculum"}</span>
        {"\n"}
        <span style={{ color: domain.color }}>{"└── " + domain.label}</span>
        {chain.map((t, i) => {
          const last = i === chain.length - 1;
          const indent = "    ".repeat(i + 1);
          return (
            <span key={t.id}>
              {"\n"}
              {indent}
              {"└── "}
              {last ? (
                <span className="font-semibold text-[#1b293e]">
                  {t.title} <span className="text-[#105dff]">← current topic</span>
                </span>
              ) : (
                <Link href={`/academy/topics/${t.id}`} className="underline decoration-slate-300 underline-offset-2 hover:text-[#105dff]">
                  {t.title}
                </Link>
              )}
            </span>
          );
        })}
      </pre>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Eyebrow>Prerequisites</Eyebrow>
          {topic.prereqs.length === 0 ? (
            <p className="mt-1.5 text-sm text-gray-500">None — this is a root topic.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {topic.prereqs.map((p) => {
                const t = TOPIC_BY_ID[p];
                if (!t) return null;
                const c = confidenceOf(p);
                return (
                  <li key={p} className="flex items-center gap-2 text-sm">
                    <ConfidenceDot level={c} />
                    <Link href={`/academy/topics/${p}`} className="text-gray-700 hover:text-[#105dff] hover:underline">
                      {t.title}
                    </Link>
                    {c === "none" && (
                      <span className="text-xs text-amber-600">← learn this first</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <Eyebrow>Unlocks next</Eyebrow>
          {unlocks.length === 0 ? (
            <p className="mt-1.5 text-sm text-gray-500">Curriculum leaf — apply it in the roadmap.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {unlocks.map((u) => (
                <li key={u} className="text-sm">
                  <span className="text-gray-400">→ </span>
                  <Link href={`/academy/topics/${u}`} className="text-gray-700 hover:text-[#105dff] hover:underline">
                    {TOPIC_BY_ID[u].title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
