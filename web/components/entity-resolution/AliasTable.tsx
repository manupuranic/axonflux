"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AliasResponse } from "@/types/api";

interface Props {
  aliases: AliasResponse[];
  total: number;
  offset: number;
  limit: number;
  isAdmin: boolean;
  onDelete: (aliasBarcode: string) => Promise<void>;
  onPageChange: (newOffset: number) => void;
}

export function AliasTable({
  aliases,
  total,
  offset,
  limit,
  isAdmin,
  onDelete,
  onPageChange,
}: Props) {
  const [deletingBarcode, setDeletingBarcode] = useState<string | null>(null);

  async function handleDelete(aliasBarcode: string) {
    if (!confirm(`Undo alias for barcode ${aliasBarcode}? It will reappear in suggestions.`)) return;
    setDeletingBarcode(aliasBarcode);
    try {
      await onDelete(aliasBarcode);
    } finally {
      setDeletingBarcode(null);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (aliases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
        <p className="text-lg font-medium">No confirmed aliases yet</p>
        <p className="text-sm mt-1">Confirm suggestions to build the alias map.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
              <th className="px-3 py-2 font-medium">Alias Barcode</th>
              <th className="px-3 py-2 font-medium">→</th>
              <th className="px-3 py-2 font-medium">Canonical</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Confirmed By</th>
              <th className="px-3 py-2 font-medium">Date</th>
              {isAdmin && <th className="px-3 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {aliases.map((alias) => (
              <tr key={alias.alias_barcode} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{alias.alias_barcode}</td>
                <td className="px-3 py-2 text-gray-400">→</td>
                <td className="px-3 py-2">
                  <div>
                    <p className="font-mono text-xs text-gray-700">{alias.canonical_barcode}</p>
                    {alias.canonical_name && (
                      <p className="text-xs text-gray-500 truncate max-w-[200px]">{alias.canonical_name}</p>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {alias.similarity_score != null ? (
                    <Badge
                      variant="outline"
                      className={
                        alias.similarity_score >= 78
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-yellow-50 text-yellow-700 border-yellow-200"
                      }
                    >
                      {alias.similarity_score.toFixed(0)}%
                    </Badge>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {alias.confirmed_by_username ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {alias.confirmed_at
                    ? new Date(alias.confirmed_at).toLocaleDateString()
                    : "—"}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleDelete(alias.alias_barcode)}
                      disabled={deletingBarcode === alias.alias_barcode}
                    >
                      {deletingBarcode === alias.alias_barcode ? "…" : "Undo"}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} of {total} aliases
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={currentPage === 1}
              onClick={() => onPageChange(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
