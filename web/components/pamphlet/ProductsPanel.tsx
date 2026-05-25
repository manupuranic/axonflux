"use client";
import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Image as ImageIcon, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PamphletItem } from "@/lib/pamphlet/types";
import {
  addItem,
  updateItem,
  removeItem,
  reorderItems,
  triggerImageScan,
  streamAgentTask,
} from "@/lib/pamphlet/api";

interface Props {
  pamphletId: string;
  initialItems: PamphletItem[];
  onItemsChange: () => void;
}

const EMPTY_FORM = {
  display_name: "",
  barcode: "",
  offer_price: "",
  original_price: "",
  highlight_text: "",
  image_url: "",
  category: "",
  unit: "",
};

type FormKey = keyof typeof EMPTY_FORM;

const ITEM_FIELDS: [FormKey, string][] = [
  ["display_name", "Name *"],
  ["barcode", "Barcode"],
  ["category", "Category"],
  ["unit", "Unit (e.g. 1kg, 500g)"],
  ["offer_price", "Offer Price (₹)"],
  ["original_price", "MRP (₹)"],
  ["highlight_text", "Badge Text"],
  ["image_url", "Image URL"],
];

// Keys of PamphletItem that are editable (string | number | null values)
type EditableKey = "display_name" | "offer_price" | "original_price" | "highlight_text" | "image_url" | "category" | "unit";

const EDIT_FIELDS: [EditableKey, string][] = [
  ["display_name", "Name *"],
  ["category", "Category"],
  ["unit", "Unit (e.g. 1kg, 500g)"],
  ["offer_price", "Offer Price (₹)"],
  ["original_price", "MRP (₹)"],
  ["highlight_text", "Badge Text"],
  ["image_url", "Image URL"],
];

interface SimpleModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

function SimpleModal({ open, onClose, title, children, footer }: SimpleModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        <div className="px-5 pt-5 pb-2 border-b">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="overflow-y-auto px-5 py-3 flex-1">{children}</div>
        <div className="px-5 pb-5 pt-2 border-t flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

export function ProductsPanel({ pamphletId, initialItems, onItemsChange }: Props) {
  const [items, setItems] = useState<PamphletItem[]>(initialItems);
  const [editItem, setEditItem] = useState<PamphletItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const filtered = items.filter((i) =>
    (i.display_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleSaveEdit() {
    if (!editItem) return;
    setSaving(true);
    try {
      const updated = await updateItem(pamphletId, editItem.id, {
        display_name: editItem.display_name,
        offer_price: editItem.offer_price,
        original_price: editItem.original_price,
        highlight_text: editItem.highlight_text,
        image_url: editItem.image_url,
        category: editItem.category,
        unit: editItem.unit,
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditItem(null);
      onItemsChange();
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!form.display_name.trim()) return;
    setSaving(true);
    try {
      const created = await addItem(pamphletId, {
        display_name: form.display_name,
        barcode: form.barcode || null,
        offer_price: form.offer_price ? parseFloat(form.offer_price) : null,
        original_price: form.original_price ? parseFloat(form.original_price) : null,
        highlight_text: form.highlight_text || null,
        image_url: form.image_url || null,
        category: form.category || null,
        unit: form.unit || null,
        sort_order: items.length,
      });
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      onItemsChange();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(itemId: string) {
    await removeItem(pamphletId, itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    onItemsChange();
  }

  async function handleMove(index: number, dir: -1 | 1) {
    const newItems = [...items];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[index], newItems[swapIdx]] = [newItems[swapIdx], newItems[index]];
    setItems(newItems);
    await reorderItems(pamphletId, newItems.map((i) => i.id));
    onItemsChange();
  }

  async function handleScanAll() {
    setScanning(true);
    setScanStatus("Starting scan...");
    try {
      const { task_id, count, message } = await triggerImageScan(pamphletId);
      if (!task_id) {
        setScanStatus(message ?? "All images already present.");
        setScanning(false);
        return;
      }
      setScanStatus(`Scanning ${count} products...`);
      streamAgentTask(
        task_id,
        (task) => {
          if (task.current_product) {
            setScanStatus(`${task.current_product} (${task.done_count}/${task.total})`);
          }
          if (task.updates.length > 0) {
            setItems((prev) =>
              prev.map((item) => {
                const upd = task.updates.find((u) => u.item_id === item.id);
                return upd ? { ...item, image_url: upd.image_url } : item;
              })
            );
          }
        },
        () => {
          setScanStatus("Scan complete.");
          setScanning(false);
          onItemsChange();
        }
      );
    } catch {
      setScanStatus("Scan failed.");
      setScanning(false);
    }
  }

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <span className="text-xs font-semibold flex-1">Products ({items.length})</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowAdd(true)} title="Add product">
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleScanAll}
          disabled={scanning}
          title="Auto-fetch missing images"
        >
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {scanStatus && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground bg-muted/20 border-b truncate">
          {scanStatus}
        </div>
      )}

      <div className="px-2 pt-2 shrink-0">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="h-7 text-xs"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-xs group"
          >
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded bg-muted shrink-0 flex items-center justify-center">
                <ImageIcon className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.display_name}</p>
              <p className="text-muted-foreground">
                {item.offer_price != null ? `₹${item.offer_price}` : "—"}
                {item.original_price != null ? ` / ₹${item.original_price}` : ""}
              </p>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleMove(index, -1)}>
                <ChevronUp className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleMove(index, 1)}>
                <ChevronDown className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditItem({ ...item })}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-8">
            {search ? "No matches." : "No products yet. Click + to add."}
          </p>
        )}
      </div>

      {/* Edit Modal */}
      <SimpleModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit Product"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </>
        }
      >
        {editItem && (
          <div className="grid gap-3">
            {EDIT_FIELDS.map(([field, label]) => (
              <div key={field} className="grid grid-cols-3 items-center gap-2">
                <label className="text-xs text-right text-muted-foreground">{label}</label>
                <Input
                  className="col-span-2 h-8 text-xs"
                  value={(editItem[field] as string | number | null) ?? ""}
                  onChange={(e) =>
                    setEditItem({ ...editItem, [field]: e.target.value || null })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </SimpleModal>

      {/* Add Modal */}
      <SimpleModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Product"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.display_name.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {ITEM_FIELDS.map(([field, label]) => (
            <div key={field} className="grid grid-cols-3 items-center gap-2">
              <label className="text-xs text-right text-muted-foreground">{label}</label>
              <Input
                className="col-span-2 h-8 text-xs"
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </SimpleModal>
    </div>
  );
}
