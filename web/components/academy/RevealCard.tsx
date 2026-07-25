"use client";

// Interview-mode card: question up front, ideal answer behind a reveal.
// Revealing is tracked — it feeds the readiness metric.

import { ChevronDown } from "lucide-react";

export function RevealCard({
  question,
  answer,
  source,
  revealed,
  onToggle,
}: {
  question: string;
  answer: string;
  source?: string;
  revealed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          {source && (
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-gray-400">
              {source}
            </div>
          )}
          <div className="mt-0.5 text-sm font-medium text-[#1b293e]">{question}</div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform ${revealed ? "rotate-180" : ""}`}
        />
      </button>
      {revealed && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-emerald-600">
            ideal answer
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-700">{answer}</p>
          <p className="mt-2 text-xs text-gray-400">
            Now close this card and say it in your own words — out loud.
          </p>
        </div>
      )}
    </div>
  );
}
