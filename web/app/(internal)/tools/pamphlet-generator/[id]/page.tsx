"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Sparkles,
  Settings,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductSearchInput } from "@/components/pamphlet/ProductSearchInput";
import { PamphletItemEditModal } from "@/components/pamphlet/PamphletItemEditModal";
import { api } from "@/lib/api";
import type { Pamphlet, PamphletItem, PamphletItemCreate } from "@/types/api";

const PamphletPDFViewer = dynamic(
  () => import("@/components/pamphlet/PamphletPDFViewer").then((m) => m.PamphletPDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading preview...
      </div>
    ),
  }
);

export default function PamphletBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [pamphlet, setPamphlet] = useState<Pamphlet | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Edit modal
  const [editItem, setEditItem] = useState<PamphletItem | null>(null);

  // Search within product list
  const [search, setSearch] = useState("");

  // Settings fields
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(5);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const load = useCallback(async () => {
    try {
      const p = await api.pamphlets.get(id);
      setPamphlet(p);
      setTitle(p.title);
      setRows(p.rows);
      setCols(p.cols);
      setValidFrom(p.valid_from ?? "");
      setValidUntil(p.valid_until ?? "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings() {
    if (!pamphlet) return;
    try {
      const updated = await api.pamphlets.update(id, {
        title: title.trim() || pamphlet.title,
        rows,
        cols,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
      });
      setPamphlet(updated);
    } catch {
      // keep UI, don't crash
    }
  }

  async function handleAddItem(item: PamphletItemCreate) {
    const added = await api.pamphlets.addItem(id, item);
    setPamphlet((prev) =>
      prev ? { ...prev, items: [...prev.items, added] } : prev
    );
  }

  function handleItemUpdate(updated: PamphletItem) {
    setPamphlet((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) }
        : prev
    );
  }

  async function handleRemove(itemId: string) {
    await api.pamphlets.removeItem(id, itemId);
    setPamphlet((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : prev
    );
  }

  async function handleGenerateHighlights() {
    setAiLoading(true);
    setAiError("");
    try {
      const updated = await api.pamphlets.generateHighlights(id);
      setPamphlet(updated);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    if (!pamphlet) return [];
    const q = search.trim().toLowerCase();
    if (!q) return pamphlet.items;
    return pamphlet.items.filter(
      (i) =>
        (i.display_name ?? "").toLowerCase().includes(q) ||
        (i.barcode ?? "").toLowerCase().includes(q)
    );
  }, [pamphlet, search]);

  const existingBarcodes = useMemo(
    () => new Set(pamphlet?.items.filter((i) => i.barcode).map((i) => i.barcode!) ?? []),
    [pamphlet]
  );

  if (loading) {
    return <div className="p-6 text-muted-foreground text-sm">Loading pamphlet...</div>;
  }

  if (!pamphlet) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive text-sm">Pamphlet not found.</p>
        <Button variant="outline" onClick={() => router.push("/tools/pamphlet-generator")}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <>
      {editItem && (
        <PamphletItemEditModal
          item={editItem}
          pamphletId={id}
          onUpdate={(updated) => {
            handleItemUpdate(updated);
            setEditItem(null);
          }}
          onClose={() => setEditItem(null)}
        />
      )}

      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="border-b px-6 py-3 flex items-center gap-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/tools/pamphlet-generator")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-semibold text-lg flex-1 truncate">{pamphlet.title}</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateHighlights}
            disabled={aiLoading || pamphlet.items.length === 0}
          >
            <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
            {aiLoading ? "Generating..." : "AI Copy"}
          </Button>
        </div>

        {aiError && (
          <div className="px-6 py-2 text-sm text-destructive bg-destructive/10 border-b">
            {aiError}
          </div>
        )}

        {/* Two-panel layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel */}
          <div className="w-80 shrink-0 border-r flex flex-col overflow-hidden">

            {/* Settings collapsible */}
            <div className="border-b shrink-0">
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </span>
                {settingsOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {settingsOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Title</label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={saveSettings}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Rows</label>
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        value={rows}
                        onChange={(e) => setRows(Number(e.target.value))}
                        onBlur={saveSettings}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Cols</label>
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        value={cols}
                        onChange={(e) => setCols(Number(e.target.value))}
                        onBlur={saveSettings}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{rows * cols} products/page</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Valid From</label>
                      <Input
                        type="date"
                        value={validFrom}
                        onChange={(e) => setValidFrom(e.target.value)}
                        onBlur={saveSettings}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Valid Until</label>
                      <Input
                        type="date"
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                        onBlur={saveSettings}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Add product — collapsible */}
            <div className="border-b shrink-0">
              <button
                onClick={() => setAddOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                <span>+ Add Product</span>
                {addOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {addOpen && (
                <div className="px-4 pb-4">
                  <ProductSearchInput
                    onAdd={async (item) => {
                      await handleAddItem(item);
                      setAddOpen(false);
                    }}
                    existingBarcodes={existingBarcodes}
                  />
                </div>
              )}
            </div>

            {/* Product list */}
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Search + count header */}
              <div className="px-3 py-2 border-b shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Products ({pamphlet.items.length})
                  </span>
                  {search && (
                    <span className="text-xs text-muted-foreground">
                      {filteredItems.length} shown
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter products..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-7 text-xs pl-7"
                  />
                </div>
              </div>

              {/* Compact list */}
              <div className="flex-1 overflow-y-auto">
                {pamphlet.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    No products yet. Use "Add Product" above.
                  </p>
                ) : filteredItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    No match for "{search}"
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {filteredItems.map((item, idx) => (
                        <tr
                          key={item.id}
                          className="border-b last:border-b-0 hover:bg-accent/50 group"
                        >
                          {/* Index */}
                          <td className="pl-3 pr-1 py-2 text-muted-foreground w-6 shrink-0">
                            {pamphlet.items.indexOf(item) + 1}
                          </td>

                          {/* Name + badge */}
                          <td className="py-2 pr-1 min-w-0">
                            <div className="truncate font-medium leading-tight">
                              {item.display_name ?? item.barcode ?? "Product"}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {item.offer_price != null ? (
                                <span className="text-green-600 font-semibold">
                                  ₹{item.offer_price.toFixed(0)}
                                </span>
                              ) : item.original_price != null ? (
                                <span className="text-foreground">
                                  ₹{item.original_price.toFixed(0)}
                                </span>
                              ) : null}
                              {item.highlight_text && (
                                <span className="bg-red-100 text-red-700 text-[9px] px-1 rounded truncate max-w-[80px]">
                                  {item.highlight_text}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-2 pr-2 w-14 shrink-0">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditItem(item)}
                                className="p-1 hover:bg-accent rounded"
                                title="Edit"
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <button
                                onClick={() => handleRemove(item.id)}
                                className="p-1 hover:bg-destructive/10 rounded"
                                title="Remove"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Right panel — PDF preview */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden min-h-0">
            <PamphletPDFViewer pamphlet={pamphlet} />
          </div>
        </div>
      </div>
    </>
  );
}
