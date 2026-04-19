"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/formatters";
import type { HotoResponse } from "@/types/api";

interface HotoHistoryProps {
  items: HotoResponse[];
  isAdmin?: boolean;
  onVerify?: (id: string, status: "verified" | "rejected", notes: string) => Promise<void>;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-yellow-100 text-yellow-700",
  verified: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface VerifyRowProps {
  record: HotoResponse;
  onVerify: (id: string, status: "verified" | "rejected", notes: string) => Promise<void>;
}

function VerifyRow({ record, onVerify }: VerifyRowProps) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(status: "verified" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await onVerify(record.id, status, notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="bg-amber-50 border-b">
      <td colSpan={6} className="px-3 sm:px-4 py-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            placeholder="Verification note (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            className="flex-1 h-9 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9 flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
              onClick={() => act("verified")}
              disabled={busy}
            >
              {busy ? "…" : "Verify"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 flex-1 sm:flex-none border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => act("rejected")}
              disabled={busy}
            >
              Reject
            </Button>
          </div>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </td>
    </tr>
  );
}

export function HotoHistory({ items, isAdmin, onVerify }: HotoHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No past HOTO records yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="text-left py-2 px-3 sm:px-4 font-medium text-gray-600">Date</th>
            <th className="text-left py-2 px-2 sm:px-4 font-medium text-gray-600">Status</th>
            <th className="text-right py-2 px-2 sm:px-4 font-medium text-gray-600">Net Sales</th>
            <th className="text-right py-2 px-2 sm:px-4 font-medium text-gray-600">Expected</th>
            <th className="text-right py-2 px-2 sm:px-4 font-medium text-gray-600">Diff</th>
            {isAdmin && <th className="py-2 px-2 sm:px-4" />}
          </tr>
        </thead>
        <tbody>
          {items.map((rec) => {
            const diff = rec.difference_amount;
            const diffPositive = diff !== null && diff >= 0;
            const canVerify = isAdmin && onVerify && rec.status === "submitted";
            const isExpanded = expandedId === rec.id;

            return (
              <>
                <tr key={rec.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2.5 px-3 sm:px-4 font-medium text-gray-800 whitespace-nowrap">
                    {formatDate(rec.closure_date)}
                  </td>
                  <td className="py-2.5 px-2 sm:px-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        STATUS_STYLES[rec.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {rec.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 sm:px-4 text-right tabular-nums text-gray-700 whitespace-nowrap">
                    {formatInr(rec.net_sales)}
                  </td>
                  <td className="py-2.5 px-2 sm:px-4 text-right tabular-nums text-gray-700 whitespace-nowrap">
                    {formatInr(rec.expected_cash)}
                  </td>
                  <td
                    className={`py-2.5 px-2 sm:px-4 text-right tabular-nums font-semibold whitespace-nowrap ${
                      diff === null
                        ? "text-gray-400"
                        : diff === 0
                        ? "text-green-600"
                        : diffPositive
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {diff === null
                      ? "—"
                      : `${diffPositive && diff !== 0 ? "+" : ""}${formatInr(diff)}`}
                  </td>
                  {isAdmin && (
                    <td className="py-2.5 px-2 sm:px-4 text-right">
                      {canVerify && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs whitespace-nowrap"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : rec.id)
                          }
                        >
                          {isExpanded ? "Cancel" : "Review"}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
                {isExpanded && canVerify && onVerify && (
                  <VerifyRow key={`verify-${rec.id}`} record={rec} onVerify={async (id, status, notes) => {
                    await onVerify(id, status, notes);
                    setExpandedId(null);
                  }} />
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
