"use client";

import { useState } from "react";
import { Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { PamphletItem } from "@/types/api";

interface Props {
  item: PamphletItem;
  pamphletId: string;
  onUpdate: (updated: PamphletItem) => void;
  onRemove: (id: string) => void;
}

export function PamphletItemCard({ item, pamphletId, onUpdate, onRemove }: Props) {
  const [displayName, setDisplayName] = useState(item.display_name ?? "");
  const [originalPrice, setOriginalPrice] = useState(
    item.original_price != null ? String(item.original_price) : ""
  );
  const [offerPrice, setOfferPrice] = useState(
    item.offer_price != null ? String(item.offer_price) : ""
  );
  const [imageUrl, setImageUrl] = useState(item.image_url ?? "");
  const [highlightText, setHighlightText] = useState(item.highlight_text ?? "");
  const [removing, setRemoving] = useState(false);

  async function patch(fields: Partial<{
    display_name: string | null;
    original_price: number | null;
    offer_price: number | null;
    image_url: string | null;
    highlight_text: string | null;
  }>) {
    try {
      const updated = await api.pamphlets.updateItem(pamphletId, item.id, fields);
      onUpdate(updated);
    } catch {
      // silently revert — user still sees the field value
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.pamphlets.removeItem(pamphletId, item.id);
      onRemove(item.id);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="border rounded-md p-3 bg-card space-y-2 group">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
        <div className="flex-1 min-w-0">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() =>
              patch({ display_name: displayName.trim() || null })
            }
            placeholder="Product name"
            className="h-7 text-sm font-medium"
          />
        </div>
        {item.barcode ? (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground shrink-0">
            {item.barcode.slice(0, 10)}
          </span>
        ) : (
          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
            Custom
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={handleRemove}
          disabled={removing}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">MRP (₹)</label>
          <Input
            type="number"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            onBlur={() =>
              patch({
                original_price: originalPrice ? parseFloat(originalPrice) : null,
              })
            }
            placeholder="0.00"
            className="h-7 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Offer Price (₹)</label>
          <Input
            type="number"
            value={offerPrice}
            onChange={(e) => setOfferPrice(e.target.value)}
            onBlur={() =>
              patch({
                offer_price: offerPrice ? parseFloat(offerPrice) : null,
              })
            }
            placeholder="0.00"
            className="h-7 text-sm"
          />
        </div>
      </div>

      {/* Image URL */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Image URL</label>
        <Input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          onBlur={() =>
            patch({ image_url: imageUrl.trim() || null })
          }
          placeholder="https://..."
          className="h-7 text-sm"
        />
      </div>

      {/* Highlight text */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Highlight badge text</label>
        <Input
          value={highlightText}
          onChange={(e) => setHighlightText(e.target.value)}
          onBlur={() =>
            patch({ highlight_text: highlightText.trim() || null })
          }
          placeholder="e.g. Save ₹50 Today!"
          className="h-7 text-sm"
        />
      </div>
    </div>
  );
}
