"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { SuggestionCluster, SuggestionItem, ProductDetail } from "@/types/api";
import { ArrowRight, ArrowLeftRight, Check, X, Info } from "lucide-react";

interface Props {
  cluster: SuggestionCluster;
  onConfirm: (aliasBarcode: string, canonicalBarcode: string) => Promise<void>;
  onReject: (suggestionId: string) => Promise<void>;
}

function ScoreBadge({ score }: { score: number }) {
  const isHigh = score >= 78;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        isHigh
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {score.toFixed(0)}%
    </span>
  );
}

/* ── Product detail hover card ── */

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right truncate">{value}</span>
    </div>
  );
}

function ProductHoverCard({ barcode }: { barcode: string }) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRef = useRef<string | null>(null);

  const handleEnter = useCallback(() => {
    timeoutRef.current = setTimeout(async () => {
      setShow(true);
      if (fetchedRef.current === barcode) return; // already loaded
      setLoading(true);
      setError(false);
      try {
        const data = await api.entityResolution.productDetail(barcode);
        setDetail(data);
        fetchedRef.current = barcode;
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [barcode]);

  const handleLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Info className="h-3.5 w-3.5 text-gray-300 hover:text-blue-500 cursor-help transition-colors" />
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 top-6 z-50 w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3 space-y-1.5 animate-in fade-in-0 zoom-in-95 duration-150">
          <p className="text-xs font-semibold text-gray-900 font-mono border-b border-gray-100 pb-1.5 mb-1">
            {barcode}
          </p>
          {loading && <p className="text-xs text-gray-400">Loading...</p>}
          {error && <p className="text-xs text-red-400">Could not load details</p>}
          {detail && !loading && (
            <>
              <DetailRow label="Name" value={detail.item_name} />
              <DetailRow label="Brand" value={detail.brand} />
              <DetailRow label="MRP" value={detail.mrp != null ? `\u20B9${detail.mrp.toFixed(2)}` : null} />
              <DetailRow label="Purchase" value={detail.purchase_price != null ? `\u20B9${detail.purchase_price.toFixed(2)}` : null} />
              <DetailRow label="Rate" value={detail.rate != null ? `\u20B9${detail.rate.toFixed(2)}` : null} />
              <DetailRow label="Size" value={detail.size} />
              <DetailRow label="Expiry" value={detail.expiry_date} />
              <DetailRow label="HSN" value={detail.hsn_code} />
              <DetailRow label="Stock" value={detail.system_stock != null ? detail.system_stock.toFixed(0) : null} />
              <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                <DetailRow label="Total sold" value={detail.total_sales_qty != null ? detail.total_sales_qty.toFixed(0) : null} />
                <DetailRow label="Last sold" value={detail.last_sold} />
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}

/* ── Barcode tag (one side of the merge pair) ── */

function BarcodeTag({ barcode, name, label, accent }: {
  barcode: string;
  name: string | null;
  label: string;
  accent: "blue" | "gray";
}) {
  const colors = accent === "blue"
    ? "bg-blue-50 border-blue-200 text-blue-900"
    : "bg-gray-50 border-gray-200 text-gray-900";
  const labelColors = accent === "blue"
    ? "text-blue-500"
    : "text-gray-400";

  return (
    <div className={`flex-1 min-w-0 rounded-lg border px-3 py-2 ${colors}`}>
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${labelColors}`}>
          {label}
        </span>
        <ProductHoverCard barcode={barcode} />
      </div>
      <p className="text-sm font-medium truncate mt-0.5">
        {name ?? <span className="italic text-gray-400">unnamed</span>}
      </p>
      <p className="text-xs font-mono text-gray-500 mt-0.5">{barcode}</p>
    </div>
  );
}

/* ── Main cluster card ── */

export function SuggestionClusterCard({ cluster, onConfirm, onReject }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [swapped, setSwapped] = useState<Set<string>>(new Set());

  const allHighConfidence = cluster.members.every((m) => m.similarity_score >= 78);
  const visibleMembers = cluster.members.filter((m) => !dismissed.has(m.id));

  if (visibleMembers.length === 0) return null;

  function isSwapped(id: string) {
    return swapped.has(id);
  }

  function toggleSwap(id: string) {
    setSwapped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getDirection(member: SuggestionItem) {
    if (isSwapped(member.id)) {
      return {
        aliasBarcode: member.canonical_candidate,
        aliasName: member.canonical_name,
        canonicalBarcode: member.alias_barcode,
        canonicalName: member.alias_name,
      };
    }
    return {
      aliasBarcode: member.alias_barcode,
      aliasName: member.alias_name,
      canonicalBarcode: member.canonical_candidate,
      canonicalName: member.canonical_name,
    };
  }

  async function handleConfirm(member: SuggestionItem) {
    const { aliasBarcode, canonicalBarcode } = getDirection(member);
    setLoadingId(member.id);
    try {
      await onConfirm(aliasBarcode, canonicalBarcode);
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

  const scoreRange =
    cluster.min_score === cluster.max_score
      ? `${cluster.min_score.toFixed(0)}%`
      : `${cluster.min_score.toFixed(0)}–${cluster.max_score.toFixed(0)}%`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Cluster header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/80 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-blue-600 text-xs font-bold">{visibleMembers.length}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {cluster.canonical_name ?? cluster.canonical_candidate}
            </p>
            <p className="text-xs text-gray-400 font-mono">{cluster.canonical_candidate}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{scoreRange}</span>
          {allHighConfidence && visibleMembers.length > 1 && (
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConfirmAll}
              disabled={loadingId !== null}
            >
              Confirm All
            </Button>
          )}
        </div>
      </div>

      {/* Member rows */}
      <div className="divide-y divide-gray-100">
        {visibleMembers.map((member) => {
          const dir = getDirection(member);
          const busy = loadingId === member.id || rejectingId === member.id;

          return (
            <div key={member.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                {/* Alias (will be merged away) */}
                <BarcodeTag
                  barcode={dir.aliasBarcode}
                  name={dir.aliasName}
                  label="Merge this"
                  accent="gray"
                />

                {/* Swap + Arrow */}
                <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                  <button
                    onClick={() => toggleSwap(member.id)}
                    className="rounded-full p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Swap direction"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </button>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                </div>

                {/* Canonical (keep this) */}
                <BarcodeTag
                  barcode={dir.canonicalBarcode}
                  name={dir.canonicalName}
                  label="Into this"
                  accent="blue"
                />

                {/* Score */}
                <div className="shrink-0 px-1">
                  <ScoreBadge score={member.similarity_score} />
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    className="h-8 w-8 p-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleConfirm(member)}
                    disabled={busy}
                    title="Confirm merge"
                  >
                    {loadingId === member.id ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => handleReject(member)}
                    disabled={busy}
                    title="Reject"
                  >
                    {rejectingId === member.id ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
