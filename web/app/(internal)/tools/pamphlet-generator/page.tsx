"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, Calendar, Package, Copy, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { PamphletSummary } from "@/types/api";

function CreateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (p: { title: string; rows: number; cols: number; valid_from?: string; valid_until?: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("April Offers");
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(5);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title required"); return; }
    setLoading(true);
    setError("");
    try {
      await onCreate({ title: title.trim(), rows, cols, valid_from: validFrom || undefined, valid_until: validUntil || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">New Pamphlet</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. April Offers" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Rows</label>
              <Input type="number" min={1} max={8} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Columns</label>
              <Input type="number" min={1} max={8} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{rows * cols} products per page</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Valid From</label>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Valid Until</label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? "Creating..." : "Create & Edit"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportSheetDialog({ onClose, onImport }: {
  onClose: () => void;
  onImport: (url: string, title: string, rows: number, cols: number) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("Imported Offers");
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setError("URL required"); return; }
    if (!title.trim()) { setError("Title required"); return; }
    setLoading(true);
    setError("");
    try {
      await onImport(url.trim(), title.trim(), rows, cols);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Import from Google Sheets</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Fetches products from a published Google Sheets CSV. Expected columns: <code className="text-xs bg-muted px-1 py-0.5 rounded">name, mrp, discount_type, discount_value, image</code>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Published CSV URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?...output=csv"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              In Google Sheets: File → Share → Publish to web → CSV
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Pamphlet Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. May Offers" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Rows</label>
              <Input type="number" min={1} max={8} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Columns</label>
              <Input type="number" min={1} max={8} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">
              <Upload className="h-4 w-4 mr-2" />
              {loading ? "Importing..." : "Import"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PamphletGeneratorPage() {
  const router = useRouter();
  const [pamphlets, setPamphlets] = useState<PamphletSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.pamphlets.list();
      setPamphlets(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(data: { title: string; rows: number; cols: number; valid_from?: string; valid_until?: string }) {
    const p = await api.pamphlets.create(data);
    router.push(`/tools/pamphlet-generator/${p.id}`);
  }

  async function handleImport(url: string, title: string, rows: number, cols: number) {
    const p = await api.pamphlets.importFromSheet({ url, title, rows, cols });
    router.push(`/tools/pamphlet-generator/${p.id}`);
  }

  async function handleDelete(e: React.MouseEvent, id: string, title: string) {
    e.stopPropagation();
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.pamphlets.delete(id);
      setPamphlets((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => t - 1);
    } finally {
      setDeleting(null);
    }
  }

  async function handleDuplicate(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDuplicating(id);
    try {
      const copy = await api.pamphlets.duplicate(id);
      router.push(`/tools/pamphlet-generator/${copy.id}`);
    } finally {
      setDuplicating(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pamphlet Generator</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create print-ready promotional pamphlets from your product catalog
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import from Sheets
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Pamphlet
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : pamphlets.length === 0 ? (
        <div className="border rounded-lg p-12 text-center space-y-3">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">No pamphlets yet</p>
            <p className="text-sm text-muted-foreground">Create one from scratch or import from Google Sheets</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import from Sheets
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Pamphlet
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {pamphlets.map((p) => (
            <div
              key={p.id}
              onClick={() => router.push(`/tools/pamphlet-generator/${p.id}`)}
              className="border rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:bg-accent transition-colors group"
            >
              <div className="h-10 w-10 rounded-md bg-green-100 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-green-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{p.title}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {p.item_count} products
                  </span>
                  <span>{p.rows}×{p.cols} grid</span>
                  {p.valid_from && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {p.valid_from}{p.valid_until ? ` – ${p.valid_until}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8"
                  onClick={(e) => handleDuplicate(e, p.id)}
                  disabled={duplicating === p.id}
                  title="Duplicate pamphlet"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  {duplicating === p.id ? "Copying..." : "Duplicate"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 text-destructive hover:text-destructive"
                  onClick={(e) => handleDelete(e, p.id, p.title)}
                  disabled={deleting === p.id}
                  title="Delete pamphlet"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  p.is_published ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                }`}>
                  {p.is_published ? "Published" : "Draft"}
                </span>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center">{total} pamphlet(s) total</p>
        </div>
      )}

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {showImport && <ImportSheetDialog onClose={() => setShowImport(false)} onImport={handleImport} />}
    </div>
  );
}
