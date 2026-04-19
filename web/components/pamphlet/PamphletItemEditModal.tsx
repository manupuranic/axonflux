"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { PamphletItem } from "@/types/api";

interface Props {
  item: PamphletItem;
  pamphletId: string;
  onUpdate: (updated: PamphletItem) => void;
  onClose: () => void;
}

export function PamphletItemEditModal({ item, pamphletId, onUpdate, onClose }: Props) {
  const [displayName, setDisplayName] = useState(item.display_name ?? "");
  const [mrp, setMrp] = useState(item.original_price?.toString() ?? "");
  const [offerPrice, setOfferPrice] = useState(item.offer_price?.toString() ?? "");
  const [imageUrl, setImageUrl] = useState(item.image_url ?? "");
  const [highlight, setHighlight] = useState(item.highlight_text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const updated = await api.pamphlets.updateItem(pamphletId, item.id, {
        display_name: displayName || null,
        original_price: mrp !== "" ? parseFloat(mrp) : null,
        offer_price: offerPrice !== "" ? parseFloat(offerPrice) : null,
        image_url: imageUrl || null,
        highlight_text: highlight || null,
      });
      onUpdate(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-background border rounded-xl shadow-xl w-full max-w-md mx-4 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-sm">Edit Product</h2>
            {item.barcode && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.barcode}</p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground -mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-8 text-sm"
              placeholder="Product name shown in pamphlet"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">MRP (₹)</label>
              <Input
                type="number"
                step="0.01"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                className="h-8 text-sm"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Offer Price (₹)</label>
              <Input
                type="number"
                step="0.01"
                value={offerPrice}
                onChange={(e) => setOfferPrice(e.target.value)}
                className="h-8 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Highlight Badge</label>
            <Input
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              className="h-8 text-sm"
              placeholder="e.g. 20% OFF, Best Value!"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Image URL</label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="h-8 text-sm"
              placeholder="https://..."
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
