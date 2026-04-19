"use client";

import { Input } from "@/components/ui/input";
import { formatInr } from "@/lib/formatters";

export type DenomState = Record<string, string>; // denomination → qty (as string for input)

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

interface DenominationGridProps {
  denominations: DenomState;
  onChange: (d: DenomState) => void;
  disabled?: boolean;
}

function totalFromState(state: DenomState): number {
  return DENOMINATIONS.reduce((sum, d) => {
    return sum + (parseInt(state[String(d)] || "0") || 0) * d;
  }, 0);
}

export function denomStateToRecord(state: DenomState): Record<string, number> {
  const result: Record<string, number> = {};
  for (const d of DENOMINATIONS) {
    const qty = parseInt(state[String(d)] || "0") || 0;
    if (qty > 0) result[String(d)] = qty;
  }
  return result;
}

export function recordToDenomState(record: Record<string, number>): DenomState {
  const state: DenomState = {};
  for (const d of DENOMINATIONS) {
    const qty = record[String(d)];
    if (qty) state[String(d)] = String(qty);
  }
  return state;
}

export function getDenomTotal(state: DenomState): number {
  return totalFromState(state);
}

export function DenominationGrid({
  denominations,
  onChange,
  disabled,
}: DenominationGridProps) {
  const total = totalFromState(denominations);
  const noteCount = DENOMINATIONS.reduce(
    (s, d) => s + (parseInt(denominations[String(d)] || "0") || 0),
    0
  );

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-600 w-16 sm:w-20">
              Note
            </th>
            <th className="text-center py-2 px-2 sm:px-3 font-medium text-gray-600">
              Qty
            </th>
            <th className="text-right py-2 px-2 sm:px-3 font-medium text-gray-600 w-24 sm:w-28">
              = ₹
            </th>
          </tr>
        </thead>
        <tbody>
          {DENOMINATIONS.map((d) => {
            const qty = parseInt(denominations[String(d)] || "0") || 0;
            return (
              <tr key={d} className="border-b last:border-0 hover:bg-gray-50/50">
                <td className="py-1 px-2 sm:px-3 font-medium text-gray-700">
                  ₹{d}
                </td>
                <td className="py-1 px-2 sm:px-3">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={denominations[String(d)] ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      onChange({ ...denominations, [String(d)]: e.target.value })
                    }
                    disabled={disabled}
                    className="h-8 text-center text-sm w-full"
                  />
                </td>
                <td className="py-1 px-2 sm:px-3 text-right text-gray-600 tabular-nums">
                  {qty > 0 ? formatInr(qty * d) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-blue-50 border-t-2 font-bold">
            <td className="py-2.5 px-2 sm:px-3 text-blue-800">Total</td>
            <td className="py-2.5 px-2 sm:px-3 text-center text-blue-700 text-xs font-normal">
              {noteCount} notes
            </td>
            <td className="py-2.5 px-2 sm:px-3 text-right text-blue-900 text-base tabular-nums">
              {formatInr(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
