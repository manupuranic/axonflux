"use client";

import { formatInr } from "@/lib/formatters";

interface ReconciliationSummaryProps {
  inside: number;
  outside: number;
  expected: number;
  denomTotal: number;
}

export function ReconciliationSummary({
  inside,
  outside,
  expected,
  denomTotal,
}: ReconciliationSummaryProps) {
  // Denomination count total IS the physical count — no separate input needed
  const difference = denomTotal > 0 ? denomTotal - expected : null;

  const isPositive = difference !== null && difference >= 0;
  const isZero = difference === 0;

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      {/* Top row: Inside vs Outside */}
      <div className="grid grid-cols-2 border-b">
        <div className="p-4 border-r">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Inside Counter
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatInr(inside)}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Outside Counter
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatInr(outside)}
          </p>
        </div>
      </div>

      {/* Expected cash */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">
          Expected Physical Cash
          <span className="text-gray-400 font-normal ml-1">(Inside − Outside)</span>
        </span>
        <span className="text-lg font-semibold tabular-nums">{formatInr(expected)}</span>
      </div>

      {/* Physical cash counted — derived from denomination grid */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between text-sm">
        <span className="text-gray-600 font-medium">
          Physical Cash Counted
          <span className="text-gray-400 font-normal ml-1">(from denomination count)</span>
        </span>
        <span className="tabular-nums font-semibold text-lg">
          {denomTotal > 0 ? formatInr(denomTotal) : <span className="text-gray-400 text-sm font-normal">Fill denomination count below</span>}
        </span>
      </div>

      {/* Difference — the main result */}
      <div
        className={[
          "p-4 flex items-center justify-between",
          difference === null
            ? "bg-gray-50"
            : isZero
            ? "bg-green-50"
            : isPositive
            ? "bg-green-50"
            : "bg-red-50",
        ].join(" ")}
      >
        <div>
          <p className="text-sm font-medium text-gray-600">Difference</p>
          <p className="text-xs text-gray-400">Physical Count − Expected Cash</p>
        </div>
        <div className="text-right">
          {difference === null ? (
            <p className="text-gray-400 text-sm">Fill denomination count below</p>
          ) : (
            <>
              <p
                className={[
                  "text-3xl font-bold tabular-nums",
                  isZero
                    ? "text-green-700"
                    : isPositive
                    ? "text-green-700"
                    : "text-red-600",
                ].join(" ")}
              >
                {isPositive && !isZero ? "+" : ""}
                {formatInr(difference)}
              </p>
              <p
                className={[
                  "text-xs font-medium mt-0.5",
                  isZero
                    ? "text-green-600"
                    : isPositive
                    ? "text-green-600"
                    : "text-red-500",
                ].join(" ")}
              >
                {isZero
                  ? "Exact match"
                  : isPositive
                  ? "Surplus"
                  : "Shortage"}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
