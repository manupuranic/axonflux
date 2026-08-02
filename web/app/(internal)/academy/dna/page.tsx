"use client";

import Link from "next/link";
import { Card, Eyebrow } from "@/components/academy/ui";
import { CapabilityChip } from "@/components/academy/v2";
import { DNA_PRINCIPLES } from "@/lib/academy/dna";
import { CAPABILITY_BY_ID } from "@/lib/academy/capabilities";
import { DECISION_BY_ID, decisionsForPrinciple } from "@/lib/academy/decisions";
import { ARCH_NODES } from "@/lib/academy/architecture";

export default function DnaPage() {
  return (
    <div className="max-w-4xl px-4 py-6">

      <div className="mb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          Project DNA
        </div>
        <h2 className="text-xl font-bold text-[#1b293e]">What stays true</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          The rules that outlive any technology choice here. The test for this list: would it still
          hold in five years no matter what the stack is? Anything needing an &ldquo;except
          when&rdquo; is a decision, not DNA — those live in{" "}
          <Link href="/academy/decisions" className="text-[#105dff] hover:underline">
            Decision History
          </Link>
          .
        </p>
      </div>

      <div className="space-y-4">
        {DNA_PRINCIPLES.map((p, i) => {
          const decisions = decisionsForPrinciple(p.id);
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b293e] font-mono text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-[#1b293e]">{p.statement}</h3>

                  <div className="mt-3">
                    <Eyebrow>Why</Eyebrow>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{p.rationale}</p>
                  </div>

                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <Eyebrow>What it costs</Eyebrow>
                    <p className="mt-1 text-sm leading-relaxed text-amber-900">{p.cost}</p>
                  </div>

                  {p.examples.length > 0 ? (
                    <div className="mt-3">
                      <Eyebrow>Seen in</Eyebrow>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {p.examples.map((ex) => {
                          const cap = CAPABILITY_BY_ID[ex];
                          if (cap) {
                            return (
                              <CapabilityChip
                                key={ex}
                                id={ex}
                                title={cap.title}
                                status={cap.status}
                              />
                            );
                          }
                          const dec = DECISION_BY_ID[ex];
                          if (dec) {
                            return (
                              <Link
                                key={ex}
                                href="/academy/decisions"
                                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                              >
                                {dec.title}
                              </Link>
                            );
                          }
                          const node = ARCH_NODES.find((n) => n.id === ex);
                          return (
                            <span
                              key={ex}
                              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600"
                            >
                              {node?.label ?? ex}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {decisions.length > 0 ? (
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-gray-400">
                      {decisions.length} decision{decisions.length > 1 ? "s" : ""} cite this
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
