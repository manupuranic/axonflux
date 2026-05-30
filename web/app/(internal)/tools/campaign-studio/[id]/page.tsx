"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Layers, Package, Sparkles,
  FileDown, Copy, Trash2, ExternalLink, LayoutGrid, PenLine,
  Search, Pencil, BookOpen, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type {
  Campaign, CampaignProduct, CampaignDesignSummary,
  CampaignDesignCreate, CampaignStudioMeta,
  CampaignProductCreate, CampaignProductUpdate,
  PamphletSummary, ProductSearchResult,
} from "@/types/api";

const TARGET_LABELS: Record<string, string> = {
  a4_landscape: "A4 Landscape",
  a4_portrait: "A4 Portrait",
  a5: "A5",
  ig_post_1080: "Instagram Post",
  ig_story_1080: "Instagram Story",
  wa_1080: "WhatsApp",
  fb_1200x630: "Facebook",
  custom: "Custom Size",
};

const DESIGN_TYPE_LABELS: Record<string, string> = {
  pamphlet: "Pamphlet",
  flyer: "Flyer",
  poster: "Poster",
  wa_creative: "WhatsApp Creative",
  ig_post: "Instagram Post",
  ig_story: "Instagram Story",
  fb_post: "Facebook Post",
  festival_banner: "Festival Banner",
  product_spotlight: "Product Spotlight",
  announcement: "Announcement",
};

// ---------------------------------------------------------------------------
// Add Design Dialog
// ---------------------------------------------------------------------------

function AddDesignDialog({
  meta,
  onClose,
  onAdd,
}: {
  meta: CampaignStudioMeta;
  onClose: () => void;
  onAdd: (body: CampaignDesignCreate) => Promise<void>;
}) {
  const [title, setTitle] = useState("New Design");
  const [designType, setDesignType] = useState("pamphlet");
  const [target, setTarget] = useState("a4_landscape");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onAdd({ title, design_type: designType, target });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Design</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Type</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={designType}
                onChange={(e) => setDesignType(e.target.value)}
              >
                {meta.design_types.map((t) => (
                  <option key={t} value={t}>{DESIGN_TYPE_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Target</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {meta.targets.filter((t) => t !== "custom").map((t) => (
                  <option key={t} value={t}>{TARGET_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Adding..." : "Add Design"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Design Card
// ---------------------------------------------------------------------------

function DesignCard({
  design,
  campaignId,
  onDuplicate,
  onDelete,
  onExportPdf,
  onExportPng,
}: {
  design: CampaignDesignSummary;
  campaignId: string;
  onDuplicate: () => void;
  onDelete: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative bg-card border rounded-lg p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{design.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {DESIGN_TYPE_LABELS[design.design_type] ?? design.design_type}
            {" · "}
            {TARGET_LABELS[design.target] ?? design.target}
          </p>
        </div>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <span className="text-muted-foreground text-lg leading-none">⋮</span>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-20 bg-popover border rounded-md shadow-md w-44 py-1"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button onClick={() => { setMenuOpen(false); onExportPdf(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted">
                <FileDown className="h-3.5 w-3.5" /> Export PDF
              </button>
              <button onClick={() => { setMenuOpen(false); onExportPng(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted">
                <FileDown className="h-3.5 w-3.5" /> Export PNG
              </button>
              <div className="border-t my-1" />
              <button onClick={() => { setMenuOpen(false); onDuplicate(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted">
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </button>
              <button onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        design.status === "approved" ? "bg-green-100 text-green-800" :
        design.status === "exported" ? "bg-blue-100 text-blue-800" :
        "bg-yellow-100 text-yellow-800"
      }`}>
        {design.status}
      </span>

      <p className="text-xs text-muted-foreground mt-2">
        {design.created_at
          ? new Date(design.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "—"}
      </p>

      <div className="mt-3 pt-3 border-t">
        <a
          href={`/tools/campaign-studio/${campaignId}/designs/${design.id}/edit`}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
        >
          <PenLine className="h-3.5 w-3.5" /> Open Editor
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Dialogs
// ---------------------------------------------------------------------------

const INPUT_CLS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function ProductSearchDialog({
  campaignId,
  onClose,
  onAdded,
}: {
  campaignId: string;
  onClose: () => void;
  onAdded: (p: CampaignProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.productSearch(query, 20);
        setResults(r);
      } catch { setResults([]); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function handleAdd(r: ProductSearchResult) {
    setAdding((prev) => ({ ...prev, [r.barcode]: true }));
    try {
      const p = await api.campaignStudio.addProduct(campaignId, {
        barcode: r.barcode,
        display_name: r.canonical_name,
        original_price: r.mrp ?? undefined,
        category: r.category ?? undefined,
      });
      onAdded(p);
    } finally {
      setAdding((prev) => ({ ...prev, [r.barcode]: false }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center gap-2 p-4 border-b">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="Search by name or barcode..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {results.length === 0 && query && (
            <p className="text-sm text-muted-foreground text-center py-8">No results</p>
          )}
          {results.length === 0 && !query && (
            <p className="text-sm text-muted-foreground text-center py-8">Type to search catalog</p>
          )}
          {results.map((r) => (
            <div key={r.barcode} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.canonical_name}</p>
                <p className="text-xs text-muted-foreground">{r.barcode}{r.category ? ` · ${r.category}` : ""}{r.mrp ? ` · MRP ₹${r.mrp}` : ""}</p>
              </div>
              <Button size="sm" variant="outline" disabled={adding[r.barcode]} onClick={() => handleAdd(r)} className="h-7 text-xs shrink-0">
                {adding[r.barcode] ? "Adding…" : "Add"}
              </Button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function AddCustomDialog({
  campaignId,
  onClose,
  onAdded,
}: {
  campaignId: string;
  onClose: () => void;
  onAdded: (p: CampaignProduct) => void;
}) {
  const [form, setForm] = useState<CampaignProductCreate>({ display_name: "", offer_price: null, original_price: null, highlight_text: null, image_url: null, category: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k: keyof CampaignProductCreate, v: unknown) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name?.trim()) { setError("Name required"); return; }
    setLoading(true); setError("");
    try {
      const p = await api.campaignStudio.addProduct(campaignId, form);
      onAdded(p);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Add Custom Product</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Name *</label>
            <input className={INPUT_CLS} value={form.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">MRP (₹)</label>
              <input className={INPUT_CLS} type="number" min="0" step="0.01" placeholder="—"
                value={form.original_price ?? ""} onChange={(e) => set("original_price", e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Offer Price (₹)</label>
              <input className={INPUT_CLS} type="number" min="0" step="0.01" placeholder="—"
                value={form.offer_price ?? ""} onChange={(e) => set("offer_price", e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Badge text</label>
            <input className={INPUT_CLS} placeholder="e.g. 20% OFF" value={form.highlight_text ?? ""} onChange={(e) => set("highlight_text", e.target.value || null)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Category</label>
            <input className={INPUT_CLS} placeholder="optional" value={form.category ?? ""} onChange={(e) => set("category", e.target.value || null)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Image URL</label>
            <input className={INPUT_CLS} type="url" placeholder="https://…" value={form.image_url ?? ""} onChange={(e) => set("image_url", e.target.value || null)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? "Adding…" : "Add"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportFromPamphletDialog({
  campaignId,
  onClose,
  onImported,
}: {
  campaignId: string;
  onClose: () => void;
  onImported: (products: CampaignProduct[]) => void;
}) {
  const [pamphlets, setPamphlets] = useState<PamphletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.pamphlets.list(50, 0).then((r) => {
      setPamphlets(r.items);
      setLoading(false);
    }).catch(() => { setError("Failed to load pamphlets"); setLoading(false); });
  }, []);

  async function handleImport(pamphletId: string) {
    setImporting(pamphletId); setError("");
    try {
      const products = await api.campaignStudio.importFromPamphlet(campaignId, pamphletId);
      onImported(products);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setImporting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Import from Pamphlet</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>}
          {!loading && pamphlets.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No pamphlets found</p>}
          {pamphlets.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-md hover:bg-muted/40 border mb-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{p.template_type}{p.valid_until ? ` · until ${new Date(p.valid_until).toLocaleDateString("en-IN")}` : ""}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                disabled={importing === p.id} onClick={() => handleImport(p.id)}>
                {importing === p.id ? "Importing…" : "Import"}
              </Button>
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-destructive px-4 pb-2">{error}</p>}
        <div className="p-3 border-t flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function EditProductDialog({
  campaignId,
  product,
  onClose,
  onSaved,
}: {
  campaignId: string;
  product: CampaignProduct;
  onClose: () => void;
  onSaved: (p: CampaignProduct) => void;
}) {
  const [form, setForm] = useState<CampaignProductUpdate>({
    display_name: product.display_name,
    offer_price: product.offer_price,
    original_price: product.original_price,
    highlight_text: product.highlight_text,
    image_url: product.image_url,
    category: product.category,
    priority: product.priority,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k: keyof CampaignProductUpdate, v: unknown) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const updated = await api.campaignStudio.updateProduct(campaignId, product.id, form);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Edit Product</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Name</label>
            <input className={INPUT_CLS} value={form.display_name ?? ""} onChange={(e) => set("display_name", e.target.value || null)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">MRP (₹)</label>
              <input className={INPUT_CLS} type="number" min="0" step="0.01"
                value={form.original_price ?? ""} onChange={(e) => set("original_price", e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Offer Price (₹)</label>
              <input className={INPUT_CLS} type="number" min="0" step="0.01"
                value={form.offer_price ?? ""} onChange={(e) => set("offer_price", e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Badge text</label>
            <input className={INPUT_CLS} placeholder="e.g. 20% OFF" value={form.highlight_text ?? ""} onChange={(e) => set("highlight_text", e.target.value || null)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Category</label>
              <input className={INPUT_CLS} value={form.category ?? ""} onChange={(e) => set("category", e.target.value || null)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Priority</label>
              <select className={INPUT_CLS} value={form.priority ?? "feature"} onChange={(e) => set("priority", e.target.value)}>
                <option value="hero">Hero</option>
                <option value="feature">Feature</option>
                <option value="standard">Standard</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Image URL</label>
            <input className={INPUT_CLS} type="url" placeholder="https://…" value={form.image_url ?? ""} onChange={(e) => set("image_url", e.target.value || null)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [products, setProducts] = useState<CampaignProduct[]>([]);
  const [designs, setDesigns] = useState<CampaignDesignSummary[]>([]);
  const [meta, setMeta] = useState<CampaignStudioMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddDesign, setShowAddDesign] = useState(false);
  const [activeTab, setActiveTab] = useState<"designs" | "products">("designs");
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CampaignProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, prods, desns, m] = await Promise.all([
        api.campaignStudio.getCampaign(campaignId),
        api.campaignStudio.listProducts(campaignId),
        api.campaignStudio.listDesigns(campaignId),
        api.campaignStudio.meta(),
      ]);
      setCampaign(c);
      setProducts(prods);
      setDesigns(desns);
      setMeta(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { load(); }, [campaignId]);

  async function handleAddDesign(body: CampaignDesignCreate) {
    const design = await api.campaignStudio.createDesign(campaignId, body);
    setDesigns((prev) => [...prev, design]);
    setShowAddDesign(false);
  }

  async function handleDuplicateDesign(designId: string) {
    try {
      const copy = await api.campaignStudio.duplicateDesign(campaignId, designId);
      setDesigns((prev) => [...prev, copy]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDeleteDesign(designId: string) {
    if (!confirm("Delete this design?")) return;
    try {
      await api.campaignStudio.deleteDesign(campaignId, designId);
      setDesigns((prev) => prev.filter((d) => d.id !== designId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  function handleProductAdded(p: CampaignProduct) {
    setProducts((prev) => [...prev, p]);
  }

  function handleProductSaved(p: CampaignProduct) {
    setProducts((prev) => prev.map((x) => x.id === p.id ? p : x));
  }

  async function handleRemoveProduct(productId: string) {
    if (!confirm("Remove this product from the campaign?")) return;
    try {
      await api.campaignStudio.removeProduct(campaignId, productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  function handleImported(imported: CampaignProduct[]) {
    setProducts((prev) => [...prev, ...imported]);
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error || "Campaign not found"}</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/tools/campaign-studio")} className="gap-1 mt-0.5">
          <ArrowLeft className="h-4 w-4" /> Campaigns
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
            {campaign.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              campaign.status === "active" ? "bg-green-100 text-green-800" :
              campaign.status === "archived" ? "bg-gray-100 text-gray-600" :
              "bg-yellow-100 text-yellow-800"
            }`}>{campaign.status}</span>
            {campaign.campaign_type && <span>· {campaign.campaign_type.replace(/_/g, " ")}</span>}
            {campaign.objective && <span>· {campaign.objective.replace(/_/g, " ")}</span>}
            {campaign.valid_until && (
              <span>· Until {new Date(campaign.valid_until).toLocaleDateString("en-IN")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-6">
        {(["designs", "products"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "designs" ? (
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Designs ({designs.length})
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Products ({products.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Designs Tab */}
      {activeTab === "designs" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowAddDesign(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Design
            </Button>
          </div>

          {designs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <LayoutGrid className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground">No designs yet</p>
              <Button variant="outline" onClick={() => setShowAddDesign(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Add first design
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {designs.map((d) => (
                <DesignCard
                  key={d.id}
                  design={d}
                  campaignId={campaignId}
                  onDuplicate={() => handleDuplicateDesign(d.id)}
                  onDelete={() => handleDeleteDesign(d.id)}
                  onExportPdf={() => api.campaignStudio.exportDesignPdf(campaignId, d.id, d.title)}
                  onExportPng={() => api.campaignStudio.exportDesignImage(campaignId, d.id, d.title)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Products Tab */}
      {activeTab === "products" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setShowSearchDialog(true)}>
              <Search className="h-3.5 w-3.5" /> Search Catalog
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setShowCustomDialog(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Custom
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setShowImportDialog(true)}>
              <BookOpen className="h-3.5 w-3.5" /> Import from Pamphlet
            </Button>
          </div>

          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground">No products yet</p>
              <p className="text-xs text-muted-foreground">Search catalog, add custom, or import from an existing pamphlet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 px-3 font-medium">Product</th>
                    <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Priority</th>
                    <th className="text-right py-2 px-3 font-medium">MRP</th>
                    <th className="text-right py-2 px-3 font-medium">Offer</th>
                    <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Badge</th>
                    <th className="py-2 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors group">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          {p.image_url && (
                            <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0 border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-xs">{p.display_name ?? "—"}</p>
                            {p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}{p.category ? ` · ${p.category}` : ""}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 hidden sm:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.priority === "hero" ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" :
                          p.priority === "feature" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" :
                          "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>{p.priority}</span>
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {p.original_price != null ? `₹${p.original_price}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-medium">
                        {p.offer_price != null ? `₹${p.offer_price}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground hidden md:table-cell max-w-[120px] truncate">
                        {p.highlight_text ?? "—"}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button onClick={() => setEditingProduct(p)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleRemoveProduct(p.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Design dialog */}
      {showAddDesign && meta && (
        <AddDesignDialog
          meta={meta}
          onClose={() => setShowAddDesign(false)}
          onAdd={handleAddDesign}
        />
      )}

      {showSearchDialog && (
        <ProductSearchDialog
          campaignId={campaignId}
          onClose={() => setShowSearchDialog(false)}
          onAdded={handleProductAdded}
        />
      )}

      {showCustomDialog && (
        <AddCustomDialog
          campaignId={campaignId}
          onClose={() => setShowCustomDialog(false)}
          onAdded={handleProductAdded}
        />
      )}

      {showImportDialog && (
        <ImportFromPamphletDialog
          campaignId={campaignId}
          onClose={() => setShowImportDialog(false)}
          onImported={handleImported}
        />
      )}

      {editingProduct && (
        <EditProductDialog
          campaignId={campaignId}
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={handleProductSaved}
        />
      )}
    </div>
  );
}
