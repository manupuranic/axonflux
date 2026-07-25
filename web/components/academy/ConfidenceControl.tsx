"use client";

import type { Confidence } from "@/lib/academy/types";
import { CONFIDENCE_META } from "@/lib/academy/types";

const ORDER: Confidence[] = ["none", "partial", "solid"];

const DESCRIPTIONS: Record<Confidence, string> = {
  none: "I don't understand this yet",
  partial: "I get the idea, couldn't defend it in an interview",
  solid: "I could explain and rebuild this from memory",
};

export function ConfidenceControl({
  value,
  onChange,
}: {
  value: Confidence;
  onChange: (c: Confidence) => void;
}) {
  return (
    <div>
      <div className="flex gap-2">
        {ORDER.map((c) => {
          const m = CONFIDENCE_META[c];
          const active = value === c;
          return (
            <button
              key={c}
              onClick={() => onChange(c)}
              title={DESCRIPTIONS[c]}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
              style={active ? { backgroundColor: m.color } : undefined}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? "white" : m.color }}
              />
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">{DESCRIPTIONS[value]}</p>
    </div>
  );
}
