"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SuggestionCluster, SuggestionItem } from "@/types/api";

interface Props {
  cluster: SuggestionCluster;
  onConfirm: (aliasBarcode: string, canonicalBarcode: string) => Promise<void>;
  onReject: (suggestionId: string) => Promise<void>;
}

function ScoreBadge({ score }: { score: number }) {
  const isHigh = score >= 78;
  return (
    <Badge
      className={
        isHigh
          ? "bg-green-100 text-green-800 border-green-200"
          : "bg-yellow-100 text-yellow-800 border-yellow-200"
      }
      variant="outline"
    >
      {score.toFixed(0)}%
    </Badge>
  );
}

export function SuggestionClusterCard({ cluster, onConfirm, onReject }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const allHighConfidence = cluster.members.every((m) => m.similarity_score >= 78);
  const visibleMembers = cluster.members.filter((m) => !dismissed.has(m.id));

  if (visibleMembers.length === 0) return null;

  async function handleConfirm(member: SuggestionItem) {
    setLoadingId(member.id);
    try {
      await onConfirm(member.alias_barcode, member.canonical_candidate);
      setDismissed((prev) => new Set(prev).add(member.id));
    } finally {
      setLoadingId(null);
    }
  }

  async function handleReject(member: SuggestionItem) {
    setRejectingId(member.id);
    try {
      await onReject(member.id);
      setDismissed((prev) => new Set(prev).add(member.id));
    } finally {
      setRejectingId(null);
    }
  }

  async function handleConfirmAll() {
    for (const member of visibleMembers) {
      await handleConfirm(member);
    }
  }

  return (
    <Card className="border border-gray-200">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {cluster.canonical_name ?? cluster.canonical_candidate}
            </p>
            <p className="text-xs text-gray-500 font-mono">{cluster.canonical_candidate}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {visibleMembers.length} alias{visibleMembers.length !== 1 ? "es" : ""}
            </Badge>
            <span className="text-xs text-gray-400">
              {cluster.min_score.toFixed(0)}–{cluster.max_score.toFixed(0)}%
            </span>
            {allHighConfidence && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-green-300 text-green-700 hover:bg-green-50"
                onClick={handleConfirmAll}
                disabled={loadingId !== null}
              >
                Confirm All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="pb-1 pr-3 font-medium">Alias Barcode</th>
                <th className="pb-1 pr-3 font-medium">Name in Raw Data</th>
                <th className="pb-1 pr-3 font-medium">Score</th>
                <th className="pb-1 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr key={member.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs text-gray-600">
                    {member.alias_barcode}
                  </td>
                  <td className="py-2 pr-3 text-gray-800 max-w-xs truncate">
                    {member.alias_name ?? <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <ScoreBadge score={member.similarity_score} />
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleConfirm(member)}
                        disabled={loadingId === member.id || rejectingId === member.id}
                      >
                        {loadingId === member.id ? "…" : "Confirm"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleReject(member)}
                        disabled={loadingId === member.id || rejectingId === member.id}
                      >
                        {rejectingId === member.id ? "…" : "Reject"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
