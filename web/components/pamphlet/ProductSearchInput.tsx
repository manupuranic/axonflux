"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Plus, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ProductSearchResult, PamphletItemCreate } from "@/types/api";

type Tab = "catalog" | "custom";

interface Props {
  onAdd: (item: PamphletItemCreate) => Promise<void>;
  existingBarcodes: Set<string>;
}

export function ProductSearchInput({ onAdd, existingBarcodes }: Props) {
  const [tab, setTab] = useState<Tab>("catalog");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  // Custom product fields
  const [customName, setCustomName] = useState("");
  const [customMrp, setCustomMrp] = useState("");
  const [customOffer, setCustomOffer] = useState("");
  const [customImage, setCustomImage] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.productSearch(query.trim());
        setResults(res);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleSelectCatalog(product: ProductSearchResult) {
    setOpen(false);
    setQuery("");
    setAdding(true);
    try {
      await onAdd({
        barcode: product.barcode,
        display_name: product.canonical_name,
        original_price: product.mrp ?? undefined,
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleAddCustom() {
    if (!customName.trim()) return;
    setAdding(true);
    try {
      await onAdd({
        barcode: null,
        display_name: customName.trim(),
        original_price: customMrp ? parseFloat(customMrp) : null,
        offer_price: customOffer ? parseFloat(customOffer) : null,
        image_url: customImage.trim() || null,
      });
      setCustomName("");
      setCustomMrp("");
      setCustomOffer("");
      setCustomImage("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
        <button
          onClick={() => setTab("catalog")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            tab === "catalog"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Search Catalog
        </button>
        <button
          onClick={() => setTab("custom")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            tab === "custom"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Custom Product
        </button>
      </div>

      {tab === "catalog" && (
        <div className="relative" ref={containerRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or barcode..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
              {results.map((r) => {
                const already = existingBarcodes.has(r.barcode);
                return (
                  <button
                    key={r.barcode}
                    disabled={already || adding}
                    onClick={() => handleSelectCatalog(r)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-accent transition-colors ${
                      already ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium">{r.canonical_name}</div>
                      <div className="text-xs text-muted-foreground">{r.barcode}</div>
                    </div>
                    <div className="text-xs text-right">
                      {r.mrp != null && (
                        <div className="font-medium">₹{r.mrp.toFixed(0)}</div>
                      )}
                      {r.category && (
                        <div className="text-muted-foreground">{r.category}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {open && results.length === 0 && query.trim().length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg px-3 py-3 text-sm text-muted-foreground">
              No products found
            </div>
          )}
        </div>
      )}

      {tab === "custom" && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex gap-2">
            <Input
              placeholder="Product name *"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="MRP (₹)"
              type="number"
              value={customMrp}
              onChange={(e) => setCustomMrp(e.target.value)}
            />
            <Input
              placeholder="Offer price (₹)"
              type="number"
              value={customOffer}
              onChange={(e) => setCustomOffer(e.target.value)}
            />
          </div>
          <Input
            placeholder="Image URL (optional)"
            value={customImage}
            onChange={(e) => setCustomImage(e.target.value)}
          />
          <Button
            size="sm"
            onClick={handleAddCustom}
            disabled={!customName.trim() || adding}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            {adding ? "Adding..." : "Add Custom Product"}
          </Button>
        </div>
      )}
    </div>
  );
}
