"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, CheckCircle2, X, Plus, Trash2, Pencil } from "lucide-react";
import type { BomMapping, BomSuggestionGroup } from "@/types/api";

// ---------------------------------------------------------------------------
// Score badge
// ---------------------------------------------------------------------------

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 90
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {score.toFixed(0)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Suggestion group card — collapsible, local-only done state (no scroll reset)
// ---------------------------------------------------------------------------

function SuggestionGroupCard({
  group,
  onItemActioned,
}: {
  group: BomSuggestionGroup;
  onItemActioned: () => void;
}) {
  const [open, setOpen]       = useState(true);
  const [qtys, setQtys]       = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [done, setDone]       = useState<Record<string, boolean>>({});

  const handleConfirm = async (suggestionId: string, finishedBarcode: string) => {
    const qty = parseFloat(qtys[suggestionId] ?? "");
    if (!qty || qty <= 0) return;
    setLoading((p) => ({ ...p, [suggestionId]: true }));
    try {
      await api.bom.confirm({
        raw_barcode: group.raw_barcode,
        finished_barcode: finishedBarcode,
        qty_per_unit: qty,
        suggestion_id: suggestionId,
      });
      setDone((p) => ({ ...p, [suggestionId]: true }));
      onItemActioned();
    } finally {
      setLoading((p) => ({ ...p, [suggestionId]: false }));
    }
  };

  const handleReject = async (suggestionId: string) => {
    setLoading((p) => ({ ...p, [suggestionId]: true }));
    try {
      await api.bom.reject(suggestionId);
      setDone((p) => ({ ...p, [suggestionId]: true }));
      onItemActioned();
    } finally {
      setLoading((p) => ({ ...p, [suggestionId]: false }));
    }
  };

  const pending = group.suggestions.filter((s) => !done[s.id]);
  if (pending.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header — click to collapse */}
      <button
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-gray-900 text-sm">{group.raw_name ?? group.raw_barcode}</span>
          <span className="text-xs text-gray-400 font-mono ml-2">{group.raw_barcode}</span>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{pending.length} pending</span>
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {pending.map((s) => (
            <div key={s.id} className="px-4 py-3 space-y-2">
              {/* Product info row */}
              <div className="flex items-start gap-2">
                <ScoreBadge score={s.similarity_score} />
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 wrap-break-word">{s.finished_name ?? s.finished_barcode}</p>
                  <p className="text-xs text-gray-400 font-mono">{s.finished_barcode}</p>
                </div>
              </div>
              {/* Action row */}
              <div className="flex items-center gap-2 pl-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="qty/unit"
                  className="w-28 h-8 text-sm"
                  value={qtys[s.id] ?? ""}
                  onChange={(e) => setQtys((p) => ({ ...p, [s.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!qtys[s.id] || parseFloat(qtys[s.id]) <= 0 || loading[s.id]}
                  onClick={() => handleConfirm(s.id, s.finished_barcode)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-gray-400 hover:text-red-600"
                  disabled={loading[s.id]}
                  onClick={() => handleReject(s.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active BOMs — grouped by raw material, collapsible
// ---------------------------------------------------------------------------

function MappingsGrouped({
  mappings,
  onUpdated,
}: {
  mappings: BomMapping[];
  onUpdated: () => void;
}) {
  const [search, setSearch]   = useState("");
  const [editId, setEditId]   = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [saving, setSaving]   = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) =>
    setOpenGroups((p) => ({ ...p, [key]: p[key] === false ? true : false }));
  const isOpen = (key: string) => openGroups[key] !== false;

  const handleSave = async (id: string) => {
    const qty = parseFloat(editQty);
    if (!qty || qty <= 0) return;
    setSaving(true);
    try {
      await api.bom.update(id, { qty_per_unit: qty });
      setEditId(null);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this BOM mapping? Stock position updates on next pipeline rebuild.")) return;
    await api.bom.delete(id);
    onUpdated();
  };

  if (mappings.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">No confirmed BOMs yet.</p>;
  }

  const q = search.toLowerCase().trim();
  const filtered = q
    ? mappings.filter((m) =>
        (m.raw_name ?? m.raw_barcode).toLowerCase().includes(q) ||
        (m.finished_name ?? m.finished_barcode).toLowerCase().includes(q) ||
        m.raw_barcode.toLowerCase().includes(q) ||
        m.finished_barcode.toLowerCase().includes(q)
      )
    : mappings;

  // Group by raw_barcode
  const groups: Record<string, { raw_name: string | null; items: BomMapping[] }> = {};
  for (const m of filtered) {
    if (!groups[m.raw_barcode]) groups[m.raw_barcode] = { raw_name: m.raw_name, items: [] };
    groups[m.raw_barcode].items.push(m);
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <Input
        placeholder="Search raw material or finished good…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {Object.keys(groups).length === 0 && (
        <p className="text-sm text-gray-500 py-4 text-center">No results for "{search}"</p>
      )}

      {Object.entries(groups).map(([rawBarcode, group]) => (
        <div key={rawBarcode} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {/* Group header */}
          <button
            className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors text-left"
            onClick={() => toggleGroup(rawBarcode)}
          >
            {isOpen(rawBarcode)
              ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-gray-900 text-sm">{group.raw_name ?? rawBarcode}</span>
              <span className="text-xs text-gray-400 font-mono ml-2">{rawBarcode}</span>
            </div>
            <span className="text-xs text-gray-400 shrink-0">
              {group.items.length} {group.items.length === 1 ? "good" : "goods"}
            </span>
          </button>

          {isOpen(rawBarcode) && (
            <div className="divide-y divide-gray-100">
              {group.items.map((m) => (
                <div key={m.id} className="px-4 py-3 space-y-2">
                  {/* Finished good info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 wrap-break-word">{m.finished_name ?? m.finished_barcode}</p>
                      <p className="text-xs text-gray-400 font-mono">{m.finished_barcode}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-gray-400 hover:text-red-600 shrink-0"
                      onClick={() => handleDelete(m.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Qty row */}
                  {editId === m.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="w-28 h-8 text-sm"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        autoFocus
                      />
                      <Button size="sm" className="h-8" disabled={saving} onClick={() => handleSave(m.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">Qty/unit:</span>
                      <button
                        className="flex items-center gap-1 text-sm font-mono text-gray-800 hover:text-blue-600"
                        onClick={() => { setEditId(m.id); setEditQty(String(m.qty_per_unit)); }}
                      >
                        {m.qty_per_unit}
                        <Pencil className="h-3 w-3 opacity-50" />
                      </button>
                      {m.notes && <span className="text-xs text-gray-400">{m.notes}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual BOM creation
// ---------------------------------------------------------------------------

function ManualBomForm({ onCreated }: { onCreated: () => void }) {
  const [rawQ, setRawQ]         = useState("");
  const [finQ, setFinQ]         = useState("");
  const [rawResults, setRawResults] = useState<{ barcode: string; item_name: string }[]>([]);
  const [finResults, setFinResults] = useState<{ barcode: string; item_name: string }[]>([]);
  const [selectedRaw, setSelectedRaw] = useState<{ barcode: string; item_name: string } | null>(null);
  const [selectedFin, setSelectedFin] = useState<{ barcode: string; item_name: string } | null>(null);
  const [qty, setQty]           = useState("");
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const searchRaw = async (q: string) => {
    setRawQ(q); setSelectedRaw(null);
    if (q.length < 2) { setRawResults([]); return; }
    setRawResults(await api.bom.productSearch(q));
  };

  const searchFin = async (q: string) => {
    setFinQ(q); setSelectedFin(null);
    if (q.length < 2) { setFinResults([]); return; }
    setFinResults(await api.bom.productSearch(q));
  };

  const handleSave = async () => {
    if (!selectedRaw || !selectedFin || !qty) return;
    const qtyNum = parseFloat(qty);
    if (qtyNum <= 0) return;
    setSaving(true); setError(null);
    try {
      await api.bom.manual({
        raw_barcode: selectedRaw.barcode,
        finished_barcode: selectedFin.barcode,
        qty_per_unit: qtyNum,
        notes: notes || null,
      });
      setSelectedRaw(null); setSelectedFin(null);
      setRawQ(""); setFinQ(""); setQty(""); setNotes("");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Raw Material</label>
          {selectedRaw ? (
            <div className="flex items-center gap-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm">
              <span className="flex-1">{selectedRaw.item_name}</span>
              <button onClick={() => setSelectedRaw(null)} className="text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="relative">
              <Input placeholder="Search raw material…" value={rawQ} onChange={(e) => searchRaw(e.target.value)} />
              {rawResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                  {rawResults.map((r) => (
                    <button key={r.barcode} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => { setSelectedRaw(r); setRawResults([]); setRawQ(r.item_name); }}>
                      <span className="font-medium">{r.item_name}</span>
                      <span className="text-gray-400 font-mono text-xs ml-2">{r.barcode}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Finished Good</label>
          {selectedFin ? (
            <div className="flex items-center gap-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm">
              <span className="flex-1">{selectedFin.item_name}</span>
              <button onClick={() => setSelectedFin(null)} className="text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="relative">
              <Input placeholder="Search finished good…" value={finQ} onChange={(e) => searchFin(e.target.value)} />
              {finResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                  {finResults.map((r) => (
                    <button key={r.barcode} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => { setSelectedFin(r); setFinResults([]); setFinQ(r.item_name); }}>
                      <span className="font-medium">{r.item_name}</span>
                      <span className="text-gray-400 font-mono text-xs ml-2">{r.barcode}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Qty per unit</label>
          <Input type="number" step="0.01" min="0.01" placeholder="e.g. 1.05" className="w-36"
            value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
          <Input placeholder="e.g. 5% cleaning loss" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button disabled={!selectedRaw || !selectedFin || !qty || saving} onClick={handleSave}>
          <Plus className="h-4 w-4 mr-1" /> Add BOM
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "suggestions" | "mappings" | "manual";

export default function BomManagerPage() {
  const [tab, setTab] = useState<Tab>("suggestions");
  // Separate keys — confirming a suggestion only refreshes mappings count, not suggestions list
  const [mappingsKey, setMappingsKey] = useState(0);
  const [suggestionsKey, setSuggestionsKey] = useState(0);

  const refreshMappings    = useCallback(() => setMappingsKey((k) => k + 1), []);
  const refreshSuggestions = useCallback(() => setSuggestionsKey((k) => k + 1), []);

  const suggestionsFetch = useFetch(() => api.bom.suggestions("pending"), [suggestionsKey]);
  const mappingsFetch    = useFetch(() => api.bom.mappings(), [mappingsKey]);

  // Count pending groups (groups that still have pending items)
  const pendingGroups = suggestionsFetch.data?.length ?? 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "suggestions", label: "Suggestions",  count: pendingGroups },
    { id: "mappings",    label: "Active BOMs",   count: mappingsFetch.data?.length },
    { id: "manual",      label: "Add Manually" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">BOM Manager</h1>
        <p className="text-gray-600 mt-1">
          Map raw materials to finished goods — fixes stock position on next pipeline rebuild
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                tab === t.id ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Suggestions */}
      {tab === "suggestions" && (
        <DataStateWrapper
          loading={suggestionsFetch.loading}
          error={suggestionsFetch.error}
          empty={!suggestionsFetch.data || suggestionsFetch.data.length === 0}
          skeletonRows={4}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Enter qty of raw material consumed per finished unit to confirm. Pipeline rebuild applies changes.
            </p>
            {suggestionsFetch.data?.map((group) => (
              <SuggestionGroupCard
                key={group.raw_barcode}
                group={group}
                onItemActioned={refreshMappings}
              />
            ))}
          </div>
        </DataStateWrapper>
      )}

      {/* Active BOMs */}
      {tab === "mappings" && (
        <DataStateWrapper
          loading={mappingsFetch.loading}
          error={mappingsFetch.error}
          empty={false}
          skeletonRows={4}
        >
          <MappingsGrouped
            mappings={mappingsFetch.data ?? []}
            onUpdated={refreshMappings}
          />
        </DataStateWrapper>
      )}

      {/* Manual */}
      {tab === "manual" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Create a BOM mapping for products not detected by auto-suggest.
          </p>
          <ManualBomForm onCreated={() => { refreshMappings(); refreshSuggestions(); }} />
        </div>
      )}
    </div>
  );
}
