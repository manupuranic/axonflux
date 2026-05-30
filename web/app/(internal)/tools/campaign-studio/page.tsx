"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Sparkles, Copy, Trash2, Calendar, Target, Layers,
  Package, ChevronRight, LayoutGrid, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { CampaignSummary, CampaignCreate, CampaignStudioMeta } from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
};

const TYPE_LABELS: Record<string, string> = {
  monsoon_sale: "Monsoon Sale",
  festival_offer: "Festival Offer",
  clearance: "Clearance",
  health_campaign: "Health Campaign",
  premium_products: "Premium",
  new_arrivals: "New Arrivals",
  combo_offer: "Combo Offer",
  seasonal_promotion: "Seasonal",
  store_announcement: "Announcement",
  product_spotlight: "Spotlight",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  increase_sales: "Increase Sales",
  move_inventory: "Move Inventory",
  increase_awareness: "Awareness",
  increase_margin: "Increase Margin",
  promote_category: "Promote Category",
};

const CHANNEL_LABELS: Record<string, string> = {
  a4_landscape: "A4 Print",
  a4_portrait: "A4 Portrait",
  ig_post_1080: "Instagram Post",
  ig_story_1080: "Instagram Story",
  wa_1080: "WhatsApp",
  fb_1200x630: "Facebook",
};

// ---------------------------------------------------------------------------
// Create Dialog
// ---------------------------------------------------------------------------

function CreateCampaignDialog({
  meta,
  onClose,
  onCreate,
}: {
  meta: CampaignStudioMeta;
  onClose: () => void;
  onCreate: (body: CampaignCreate) => Promise<void>;
}) {
  const [title, setTitle] = useState("New Campaign");
  const [campaignType, setCampaignType] = useState("");
  const [objective, setObjective] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["a4_landscape"]);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title required"); return; }
    setLoading(true);
    setError("");
    try {
      await onCreate({
        title: title.trim(),
        campaign_type: campaignType || null,
        objective: objective || null,
        channels: selectedChannels,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          New Campaign
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Campaign Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monsoon Sale 2026"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Type</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value)}
              >
                <option value="">— None —</option>
                {meta.campaign_types.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Objective</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              >
                <option value="">— None —</option>
                {meta.objectives.map((o) => (
                  <option key={o} value={o}>{OBJECTIVE_LABELS[o] ?? o}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Channels</label>
            <div className="flex flex-wrap gap-2">
              {meta.targets
                .filter((t) => t !== "custom" && t !== "a5")
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleChannel(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedChannels.includes(t)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    }`}
                  >
                    {CHANNEL_LABELS[t] ?? t}
                  </button>
                ))}
            </div>
          </div>

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
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Creating..." : "Create Campaign"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign Card
// ---------------------------------------------------------------------------

function CampaignCard({
  campaign,
  onDuplicate,
  onDelete,
  onOpen,
}: {
  campaign: CampaignSummary;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative bg-card border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer"
      onClick={onOpen}
    >
      {/* Status badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[campaign.status] ?? ""}`}
        >
          {campaign.status}
        </span>

        {/* Context menu */}
        <div
          className="relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
          >
            <span className="text-muted-foreground text-lg leading-none">⋮</span>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-20 bg-popover border rounded-md shadow-md w-36 py-1"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                onClick={() => { setMenuOpen(false); onDuplicate(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-sm leading-tight mb-1 line-clamp-2">{campaign.title}</h3>

      {/* Type + Objective */}
      <div className="flex flex-wrap gap-1 mb-3">
        {campaign.campaign_type && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {TYPE_LABELS[campaign.campaign_type] ?? campaign.campaign_type}
          </span>
        )}
        {campaign.objective && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" /> {campaign.product_count}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" /> {campaign.design_count} designs
        </span>
        {campaign.valid_until && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(campaign.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Channels */}
      {campaign.channels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {campaign.channels.slice(0, 4).map((ch) => (
            <span key={ch} className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">
              {CHANNEL_LABELS[ch] ?? ch}
            </span>
          ))}
          {campaign.channels.length > 4 && (
            <span className="text-xs text-muted-foreground">+{campaign.channels.length - 4}</span>
          )}
        </div>
      )}

      {/* Arrow hint */}
      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignStudioPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<CampaignStudioMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [result, metaResult] = await Promise.all([
        api.campaignStudio.listCampaigns({ limit: 50, status: statusFilter || undefined }),
        meta ? null : api.campaignStudio.meta(),
      ]);
      setCampaigns(result.items);
      setTotal(result.total);
      if (metaResult) setMeta(metaResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, meta]);

  useEffect(() => { load(); }, [statusFilter]);

  async function handleCreate(body: CampaignCreate) {
    const campaign = await api.campaignStudio.createCampaign(body);
    setShowCreate(false);
    router.push(`/tools/campaign-studio/${campaign.id}`);
  }

  async function handleDuplicate(id: string) {
    try {
      const copy = await api.campaignStudio.duplicateCampaign(id);
      router.push(`/tools/campaign-studio/${copy.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Duplicate failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await api.campaignStudio.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => t - 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  const filtered = campaigns.filter((c) =>
    !search || c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Campaign Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build multi-channel marketing campaigns — pamphlets, posters, WhatsApp &amp; social.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          className="max-w-xs"
          placeholder="Search campaigns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1">
          {["", "draft", "active", "archived"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{total} campaign{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Megaphone className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">
            {search ? "No campaigns match your search" : "No campaigns yet"}
          </p>
          {!search && (
            <Button variant="outline" onClick={() => setShowCreate(true)} className="gap-2 mt-2">
              <Plus className="h-4 w-4" /> Create first campaign
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className={deleting === c.id ? "opacity-50 pointer-events-none" : ""}>
              <CampaignCard
                campaign={c}
                onOpen={() => router.push(`/tools/campaign-studio/${c.id}`)}
                onDuplicate={() => handleDuplicate(c.id)}
                onDelete={() => handleDelete(c.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      {showCreate && meta && (
        <CreateCampaignDialog
          meta={meta}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
