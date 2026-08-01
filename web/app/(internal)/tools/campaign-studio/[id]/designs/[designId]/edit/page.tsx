"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Save, ChevronDown, ChevronRight, Plus, X, Layers,
  Type, Image as ImageIcon, Package, Tag, Minus, MoveVertical,
  Phone, Building2, Square, LayoutGrid, QrCode, Loader2, ExternalLink,
  MessageSquare, Send, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getAiDefaults } from "@/lib/ai-settings";
import type { CampaignDesign, CampaignProduct } from "@/types/api";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// DSL types (loose — we use Record<string,any> to avoid tight coupling)
// ---------------------------------------------------------------------------

type DslNode = Record<string, unknown>;

// ---------------------------------------------------------------------------
// DSL utilities — all pure functions (immutable updates)
// ---------------------------------------------------------------------------

function genId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function findNode(root: DslNode, id: string): DslNode | null {
  if (!root || typeof root !== "object") return null;
  if (root.id === id) return root;
  for (const child of (root.children as DslNode[]) ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function updateNode(root: DslNode, id: string, patch: Partial<DslNode>): DslNode {
  if (!root || typeof root !== "object") return root;
  if (root.id === id) return { ...root, ...patch };
  const children = root.children as DslNode[] | undefined;
  if (!children) return root;
  return { ...root, children: children.map((c) => updateNode(c, id, patch)) };
}

function deleteNode(root: DslNode, id: string): DslNode {
  if (!root || typeof root !== "object") return root;
  const children = root.children as DslNode[] | undefined;
  if (!children) return root;
  return {
    ...root,
    children: children
      .filter((c) => c.id !== id)
      .map((c) => deleteNode(c, id)),
  };
}

function addChildToNode(root: DslNode, parentId: string, newNode: DslNode): DslNode {
  if (!root || typeof root !== "object") return root;
  if (root.id === parentId) {
    return { ...root, children: [...((root.children as DslNode[]) ?? []), newNode] };
  }
  const children = root.children as DslNode[] | undefined;
  if (!children) return root;
  return { ...root, children: children.map((c) => addChildToNode(c, parentId, newNode)) };
}

function lastSectionId(root: DslNode): string | null {
  const children = (root.children as DslNode[]) ?? [];
  const sections = children.filter((c) => c.type === "section");
  if (sections.length === 0) return null;
  return sections[sections.length - 1].id as string;
}

const FORMAT_DIMS: Record<string, { width_mm: number; height_mm: number }> = {
  a4_landscape: { width_mm: 297, height_mm: 210 },
  a4_portrait:  { width_mm: 210, height_mm: 297 },
  a5:           { width_mm: 210, height_mm: 148 },
  wa_1080:      { width_mm: 285.75, height_mm: 285.75 },
  ig_post_1080: { width_mm: 285.75, height_mm: 357.19 },
  ig_story_1080:{ width_mm: 285.75, height_mm: 508.0 },
  fb_1200x630:  { width_mm: 317.5, height_mm: 166.7 },
};

const BLANK_DSL: DslNode = {
  type: "page",
  id: "page-root",
  width_mm: 297,
  height_mm: 210,
  padding: "md",
  theme_id: "minimal_light",
  lang: "en",
  children: [
    { type: "section", id: "section-1", layout: "stack", gap: "md", children: [] },
  ],
};

function makeNode(type: string, extra: Partial<DslNode> = {}): DslNode {
  const base: Record<string, DslNode> = {
    text:         { type: "text", content: "New text", variant: "body", align: "left" },
    image:        { type: "image", src: "", alt: "", fit: "contain", radius: "none" },
    offer_banner: { type: "offer_banner", headline: "Special Offer!", shape: "strip" },
    divider:      { type: "divider", orientation: "horizontal", thickness: 1, color_token: "border", style: "solid" },
    spacer:       { type: "spacer", size: "md" },
    logo:         { type: "logo", src: "", height_px: 60, position: "left" },
    section:      { type: "section", layout: "stack", gap: "md", children: [] },
  };
  return { ...(base[type] ?? { type }), id: genId(type), ...extra };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Sel({
  value, options, onChange,
}: { value: string; options: string[] | { value: string; label: string }[]; onChange: (v: string) => void }) {
  const normalised = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
    >
      {normalised.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function TextInput({
  value, onChange, placeholder, rows,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  if (rows && rows > 1) {
    return (
      <textarea
        rows={rows}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none"
      />
    );
  }
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
    />
  );
}

function NumInput({ value, onChange, min, max }: {
  value: number | null | undefined; onChange: (v: number | null) => void; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
    />
  );
}

// ---------------------------------------------------------------------------
// Properties panel
// ---------------------------------------------------------------------------

function PropertiesPanel({
  node,
  onUpdate,
  onDelete,
  campaignId,
}: {
  node: DslNode | null;
  onUpdate: (id: string, patch: Partial<DslNode>) => void;
  onDelete: (id: string) => void;
  campaignId: string;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);

  if (!node) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center pt-10">
        Select a layer to edit properties
      </div>
    );
  }

  const set = (field: string, value: unknown) => onUpdate(node.id as string, { [field]: value });
  const setSO = (field: string, value: unknown) =>
    onUpdate(node.id as string, {
      style_overrides: { ...((node.style_overrides as object) ?? {}), [field]: value ?? null },
    });

  return (
    <div className="p-4 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded capitalize">
          {node.type as string}
        </span>
        {(node.type as string) !== "page" && (
          <button
            onClick={() => onDelete(node.id as string)}
            className="text-xs text-destructive hover:underline"
          >
            Delete
          </button>
        )}
      </div>

      {/* ── text ─────────────────────────────────────────── */}
      {node.type === "text" && (
        <>
          <Field label="Content">
            <TextInput value={node.content as string} onChange={(v) => set("content", v)} rows={3} />
          </Field>
          <Field label="Variant">
            <Sel value={node.variant as string} options={["heading","subheading","body","price","caption"]} onChange={(v) => set("variant", v)} />
          </Field>
          <Field label="Align">
            <Sel value={node.align as string} options={["left","center","right"]} onChange={(v) => set("align", v)} />
          </Field>
          <Field label="Font size (px)">
            <NumInput value={(node.style_overrides as { font_size_px?: number })?.font_size_px ?? null} onChange={(v) => setSO("font_size_px", v)} min={8} max={72} />
          </Field>
          <Field label="Color (hex)">
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={(node.style_overrides as { color_hex?: string })?.color_hex ?? "#111111"}
                onChange={(e) => setSO("color_hex", e.target.value)}
                className="h-8 w-12 rounded border cursor-pointer"
              />
              <TextInput
                value={(node.style_overrides as { color_hex?: string })?.color_hex ?? ""}
                onChange={(v) => setSO("color_hex", v || null)}
                placeholder="#rrggbb"
              />
            </div>
          </Field>
        </>
      )}

      {/* ── image ────────────────────────────────────────── */}
      {node.type === "image" && (
        <>
          <Field label="URL">
            <TextInput value={node.src as string} onChange={(v) => set("src", v)} placeholder="https://..." />
          </Field>
          <Field label="Upload Image">
            <label className="flex items-center gap-2 cursor-pointer w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm hover:bg-muted transition-colors">
              <Upload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-xs truncate">
                {uploadingImage ? "Uploading…" : "Choose file to upload"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={uploadingImage}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  try {
                    const url = await api.campaignStudio.uploadCampaignAsset(campaignId, file);
                    onUpdate(node.id as string, { src: url });
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setUploadingImage(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </Field>
          <Field label="Alt text">
            <TextInput value={node.alt as string} onChange={(v) => set("alt", v)} />
          </Field>
          <Field label="Fit">
            <Sel value={node.fit as string} options={["cover","contain"]} onChange={(v) => set("fit", v)} />
          </Field>
          <Field label="Radius">
            <Sel value={node.radius as string} options={["none","sm","md","lg"]} onChange={(v) => set("radius", v)} />
          </Field>
          {(node.src as string) && (
            <img src={node.src as string} alt="preview" className="w-full rounded border object-contain max-h-32" />
          )}
        </>
      )}

      {/* ── offer_banner ──────────────────────────────────── */}
      {node.type === "offer_banner" && (
        <>
          <Field label="Headline">
            <TextInput value={node.headline as string} onChange={(v) => set("headline", v)} />
          </Field>
          <Field label="Subtext">
            <TextInput value={(node.subtext ?? "") as string} onChange={(v) => set("subtext", v || null)} placeholder="Optional" />
          </Field>
          <Field label="Shape">
            <Sel value={node.shape as string} options={["strip","ribbon","badge"]} onChange={(v) => set("shape", v)} />
          </Field>
        </>
      )}

      {/* ── section ──────────────────────────────────────── */}
      {node.type === "section" && (
        <>
          <Field label="Layout">
            <Sel value={node.layout as string} options={["stack","flex","grid"]} onChange={(v) => set("layout", v)} />
          </Field>
          {node.layout === "grid" && (
            <>
              <Field label="Columns">
                <NumInput value={node.cols as number} onChange={(v) => set("cols", v)} min={1} max={10} />
              </Field>
              <Field label="Rows per page">
                <NumInput value={node.rows as number} onChange={(v) => set("rows", v)} min={1} max={10} />
              </Field>
            </>
          )}
          <Field label="Gap">
            <Sel value={(node.gap ?? "md") as string} options={["none","xs","sm","md","lg","xl"]} onChange={(v) => set("gap", v)} />
          </Field>
        </>
      )}

      {/* ── product ──────────────────────────────────────── */}
      {node.type === "product" && (
        <>
          <p className="text-xs text-muted-foreground break-all">item_id: {node.item_id as string}</p>
          {(["show_image","show_mrp","show_offer","show_badge"] as const).map((f) => (
            <Field key={f} label={f.replace(/_/g, " ")}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(node[f] ?? true) as boolean}
                  onChange={(e) => set(f, e.target.checked)}
                  className="rounded border"
                />
                <span className="text-xs">visible</span>
              </label>
            </Field>
          ))}
        </>
      )}

      {/* ── logo ─────────────────────────────────────────── */}
      {node.type === "logo" && (
        <>
          <Field label="Logo URL">
            <TextInput value={(node.src ?? "") as string} onChange={(v) => set("src", v)} placeholder="https://..." />
          </Field>
          <Field label="Height (px)">
            <NumInput value={node.height_px as number} onChange={(v) => set("height_px", v ?? 60)} min={20} max={200} />
          </Field>
          <Field label="Position">
            <Sel value={(node.position ?? "left") as string} options={["left","center","right"]} onChange={(v) => set("position", v)} />
          </Field>
        </>
      )}

      {/* ── spacer ───────────────────────────────────────── */}
      {node.type === "spacer" && (
        <Field label="Size">
          <Sel value={node.size as string} options={["xs","sm","md","lg","xl"]} onChange={(v) => set("size", v)} />
        </Field>
      )}

      {/* ── divider ──────────────────────────────────────── */}
      {node.type === "divider" && (
        <>
          <Field label="Thickness (px)">
            <NumInput value={node.thickness as number} onChange={(v) => set("thickness", v ?? 1)} min={1} max={8} />
          </Field>
          <Field label="Line style">
            <Sel value={(node.style ?? "solid") as string} options={["solid","dashed","dotted"]} onChange={(v) => set("style", v)} />
          </Field>
          <Field label="Color">
            <Sel
              value={(node.color_token ?? "border") as string}
              options={["border","primary","accent","text_muted"]}
              onChange={(v) => set("color_token", v)}
            />
          </Field>
        </>
      )}

      {/* ── page ─────────────────────────────────────────── */}
      {node.type === "page" && (
        <>
          <Field label="Width (mm)">
            <NumInput value={node.width_mm as number} onChange={(v) => set("width_mm", v ?? 297)} min={50} max={1200} />
          </Field>
          <Field label="Height (mm)">
            <NumInput value={node.height_mm as number} onChange={(v) => set("height_mm", v ?? 210)} min={50} max={1200} />
          </Field>
          <Field label="Padding">
            <Sel value={(node.padding ?? "md") as string} options={["xs","sm","md","lg"]} onChange={(v) => set("padding", v)} />
          </Field>
          <Field label="Language">
            <Sel value={(node.lang ?? "en") as string} options={["en","hi","kn"]} onChange={(v) => set("lang", v)} />
          </Field>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layers panel
// ---------------------------------------------------------------------------

const NODE_ICONS: Record<string, ReactNode> = {
  page:          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />,
  section:       <Layers className="h-3.5 w-3.5 shrink-0" />,
  text:          <Type className="h-3.5 w-3.5 shrink-0" />,
  image:         <ImageIcon className="h-3.5 w-3.5 shrink-0" />,
  product:       <Package className="h-3.5 w-3.5 shrink-0" />,
  offer_banner:  <Tag className="h-3.5 w-3.5 shrink-0" />,
  logo:          <Building2 className="h-3.5 w-3.5 shrink-0" />,
  divider:       <Minus className="h-3.5 w-3.5 shrink-0" />,
  spacer:        <MoveVertical className="h-3.5 w-3.5 shrink-0" />,
  contact_strip: <Phone className="h-3.5 w-3.5 shrink-0" />,
  qr_code:       <QrCode className="h-3.5 w-3.5 shrink-0" />,
};

function nodeLabel(node: DslNode): string {
  switch (node.type as string) {
    case "page":         return "Page";
    case "section":      return `Section · ${node.layout}`;
    case "text": {
      const c = String(node.content ?? "");
      return `"${c.slice(0, 22)}${c.length > 22 ? "…" : ""}"`;
    }
    case "image":        return (node.src as string) ? "Image" : "Image (empty)";
    case "product":      return "Product";
    case "offer_banner": return (node.headline as string) || "Offer Banner";
    case "logo":         return "Logo";
    case "divider":      return "Divider";
    case "spacer":       return `Spacer (${node.size})`;
    case "qr_code":      return "QR Code";
    case "contact_strip": return "Contact Strip";
    case "slot":         return "Slot";
    default:             return String(node.type);
  }
}

function LayerItem({
  node, depth, selectedId, onSelect, onDelete, onMention,
}: {
  node: DslNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMention?: (ref: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = (node.children as DslNode[]) ?? [];
  const hasChildren = children.length > 0;
  const isSelected = node.id === selectedId;
  const indent = depth * 14;

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 py-1 pr-2 cursor-pointer rounded-sm text-xs transition-colors ${
          isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-muted"
        }`}
        style={{ paddingLeft: `${6 + indent}px` }}
        onClick={() => onSelect(node.id as string)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            {expanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="shrink-0 text-muted-foreground">
          {NODE_ICONS[node.type as string] ?? <Square className="h-3.5 w-3.5" />}
        </span>
        <span className="flex-1 min-w-0 truncate">{nodeLabel(node)}</span>
        {onMention && (
          <button
            title="Mention in chat"
            onClick={(e) => {
              e.stopPropagation();
              onMention(`the ${node.type} node "${nodeLabel(node)}" (id: ${node.id as string})`);
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary shrink-0 transition-opacity"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        )}
        {(node.type as string) !== "page" && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.id as string); }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <LayerItem
              key={child.id as string}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onMention={onMention}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-node menu
// ---------------------------------------------------------------------------

const ADD_NODE_TYPES = [
  { type: "text",         label: "Text" },
  { type: "image",        label: "Image" },
  { type: "offer_banner", label: "Offer Banner" },
  { type: "logo",         label: "Logo" },
  { type: "divider",      label: "Divider" },
  { type: "spacer",       label: "Spacer" },
  { type: "section",      label: "Section (new)" },
];

function AddNodeMenu({
  onAdd,
  products,
}: {
  onAdd: (type: string, extra?: Partial<DslNode>) => void;
  products: CampaignProduct[];
}) {
  const [open, setOpen] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowProducts(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs w-full" onClick={() => setOpen((v) => !v)}>
        <Plus className="h-3 w-3" /> Add Node
      </Button>
      {open && (
        <div className="absolute left-0 top-8 z-30 bg-popover border rounded-md shadow-lg w-44 py-1 text-xs">
          {ADD_NODE_TYPES.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => { onAdd(type); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left"
            >
              {NODE_ICONS[type] ?? <Square className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
          {products.length > 0 && (
            <>
              <div className="border-t my-1" />
              <button
                onClick={() => setShowProducts((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left"
              >
                <Package className="h-3.5 w-3.5" />
                Add Product
                <ChevronRight className="h-3 w-3 ml-auto" />
              </button>
              {showProducts && (
                <div className="border-t py-1 max-h-48 overflow-y-auto">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onAdd("product", { item_id: p.id, show_image: true, show_mrp: true, show_offer: true, show_badge: true });
                        setOpen(false);
                        setShowProducts(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-muted truncate"
                    >
                      {p.display_name ?? p.barcode ?? p.id}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor page
// ---------------------------------------------------------------------------

export default function DesignEditorPage() {
  const params = useParams<{ id: string; designId: string }>();
  const router = useRouter();
  const { id: campaignId, designId } = params;

  const [design, setDesign] = useState<CampaignDesign | null>(null);
  const [products, setProducts] = useState<CampaignProduct[]>([]);
  const [localDsl, setLocalDsl] = useState<DslNode | null>(null);
  const [localTheme, setLocalTheme] = useState<Record<string, unknown>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const isResizingRef = useRef(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Drag-resize the right panel (Properties + Chat)
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizingRef.current) return;
      const next = window.innerWidth - e.clientX;
      setRightPanelWidth(Math.min(720, Math.max(260, next)));
    }
    function onMouseUp() {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  const [previewScale, setPreviewScale] = useState(0.65);
  const [iframeHeight, setIframeHeight] = useState(794);

  const MM_TO_PX = 3.7795;
  const pageWidthPx = Math.round(((localDsl?.width_mm as number) ?? 297) * MM_TO_PX);
  const pageHeightPx = Math.round(((localDsl?.height_mm as number) ?? 210) * MM_TO_PX);

  // Scale based on available width only — height scrolls to show all pages
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const compute = () => {
      const { width } = el.getBoundingClientRect();
      setPreviewScale(Math.min(1, (width - 64) / pageWidthPx));
    };
    compute();
    const obs = new ResizeObserver(compute);
    obs.observe(el);
    return () => obs.disconnect();
  }, [pageWidthPx]);

  // Load design + products on mount
  useEffect(() => {
    async function load() {
      try {
        const [d, prods, history] = await Promise.all([
          api.campaignStudio.getDesign(campaignId, designId),
          api.campaignStudio.listProducts(campaignId),
          api.campaignStudio.getDesignChatHistory(campaignId, designId).catch(() => []),
        ]);
        setDesign(d);
        setProducts(prods);
        if (history.length > 0) {
          setChatMessages(history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })));
        }
        const dsl = d.dsl as DslNode | null;
        setLocalDsl(dsl);
        setLocalTheme((d.theme as Record<string, unknown>) ?? {});
        if (dsl) fetchPreview(dsl, (d.theme as Record<string, unknown>) ?? {});
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load design");
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, designId]);

  const fetchPreview = useCallback(
    async (dsl: DslNode, theme: Record<string, unknown>) => {
      setIsLoadingPreview(true);
      try {
        const html = await api.campaignStudio.previewDesign(
          campaignId, designId,
          dsl as Record<string, unknown>,
          theme
        );
        setPreviewHtml(html);
      } catch {
        // silently ignore preview errors
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [campaignId, designId]
  );

  // Debounced preview refresh on DSL change
  useEffect(() => {
    if (!localDsl) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      fetchPreview(localDsl, localTheme);
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [localDsl, localTheme, fetchPreview]);

  // Write HTML into iframe; measure full content height after render so all pages show
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !previewHtml) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (doc) {
      // Suppress horizontal scroll only — vertical scroll handled by outer container
      const noHScroll = "<style>html,body{overflow-x:hidden!important;margin:0;padding:0}</style>";
      const html = previewHtml.includes("</head>")
        ? previewHtml.replace("</head>", noHScroll + "</head>")
        : noHScroll + previewHtml;
      doc.open();
      doc.write(html);
      doc.close();
      // Measure full stacked-pages height after browser lays out
      requestAnimationFrame(() => {
        const h = doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 794;
        setIframeHeight(h);
      });
    }
  }, [previewHtml]);

  // ── DSL mutation helpers ──────────────────────────────────────────────────

  function mutateDsl(next: DslNode) {
    setLocalDsl(next);
    setIsDirty(true);
  }

  function handleNodeUpdate(id: string, patch: Partial<DslNode>) {
    if (!localDsl) return;
    mutateDsl(updateNode(localDsl, id, patch));
  }

  function handleNodeDelete(id: string) {
    if (!localDsl) return;
    if (id === (localDsl.id as string)) return; // can't delete root page
    mutateDsl(deleteNode(localDsl, id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }

  function handleAddNode(type: string, extra: Partial<DslNode> = {}) {
    if (!localDsl) return;
    const newNode = makeNode(type, extra);

    if (type === "section") {
      mutateDsl(addChildToNode(localDsl, localDsl.id as string, newNode));
      setSelectedNodeId(newNode.id as string);
      return;
    }

    // Add to selected section, or last section, or create a new section
    const targetSection =
      selectedNodeId && findNode(localDsl, selectedNodeId)?.type === "section"
        ? selectedNodeId
        : lastSectionId(localDsl);

    if (targetSection) {
      mutateDsl(addChildToNode(localDsl, targetSection, newNode));
    } else {
      // No sections yet — create wrapper + add node inside
      const wrapper = makeNode("section", { children: [newNode] });
      mutateDsl(addChildToNode(localDsl, localDsl.id as string, wrapper));
    }
    setSelectedNodeId(newNode.id as string);
  }

  // Auto-scroll chat on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleChatSend() {
    const message = chatInput.trim();
    if (!message || isChatLoading) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsChatLoading(true);

    // Auto-save unsaved editor changes so chat operates on latest state
    if (isDirty && localDsl) {
      try {
        await api.campaignStudio.updateDesign(campaignId, designId, {
          dsl: localDsl as Record<string, unknown>,
          theme: localTheme,
        });
        setIsDirty(false);
      } catch {
        // proceed anyway — chat will work on last saved state
      }
    }

    try {
      const { provider, model } = getAiDefaults();
      const resp = await api.campaignStudio.chatDesign(campaignId, designId, { message, provider, model });
      const text = resp.assistant_text ?? "(no response)";
      setChatMessages((prev) => [...prev, { role: "assistant", content: text }]);
      if (resp.dsl) {
        setLocalDsl(resp.dsl as DslNode);
        setLocalTheme((resp.theme as Record<string, unknown>) ?? {});
        setIsDirty(false); // backend persisted it
      }
    } catch (e) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Failed"}` },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function handleSave() {
    if (!localDsl || !isDirty) return;
    setIsSaving(true);
    try {
      await api.campaignStudio.updateDesign(campaignId, designId, {
        dsl: localDsl as Record<string, unknown>,
        theme: localTheme,
      });
      setIsDirty(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  function handleInitBlank() {
    const dims = FORMAT_DIMS[design?.target ?? ""] ?? FORMAT_DIMS.a4_landscape;
    mutateDsl({ ...BLANK_DSL, ...dims });
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="p-8">
        <p className="text-destructive">{loadError}</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  if (!design) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedNode = selectedNodeId ? findNode(localDsl ?? {}, selectedNodeId) : null;

  return (
    /* Fixed layout that fills viewport minus the fixed sidebar (w-64 on desktop) */
    <div className="fixed inset-0 md:left-64 z-10 flex flex-col bg-background">
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <header className="shrink-0 h-12 border-b flex items-center gap-3 px-4 bg-background">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => router.push(`/tools/campaign-studio/${campaignId}`)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>

        <div className="text-sm font-medium truncate text-muted-foreground flex items-center gap-1.5">
          <span className="truncate max-w-40">{design.title}</span>
          <span className="text-xs text-muted-foreground/60">
            · {design.design_type} · {design.target}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-amber-600 font-medium">Unsaved</span>
          )}
          {isLoadingPreview && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs"
            disabled={!isDirty || isSaving}
            onClick={handleSave}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button
            size="sm"
            variant={showChat ? "default" : "ghost"}
            className="gap-1.5 h-8 text-xs"
            onClick={() => setShowChat((v) => !v)}
          >
            <MessageSquare className="h-3.5 w-3.5" /> AI Chat
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8 text-xs"
            onClick={() => api.campaignStudio.exportDesignImage(campaignId, designId, design.title)}
          >
            <ImageIcon className="h-3.5 w-3.5" /> Export PNG
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8 text-xs"
            onClick={() => api.campaignStudio.exportDesignPdf(campaignId, designId, design.title)}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </header>

      {/* ── 3-panel body ───────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left — Layers panel */}
        <div className="w-56 shrink-0 border-r flex flex-col">
          <div className="p-2 border-b">
            <AddNodeMenu onAdd={handleAddNode} products={products} />
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {!localDsl ? (
              <div className="px-3 py-4 space-y-2">
                <p className="text-xs text-muted-foreground text-center">No layout yet</p>
                <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={handleInitBlank}>
                  Start blank
                </Button>
              </div>
            ) : (
              <LayerItem
                node={localDsl}
                depth={0}
                selectedId={selectedNodeId}
                onSelect={setSelectedNodeId}
                onDelete={handleNodeDelete}
                onMention={(ref) => {
                  setShowChat(true);
                  setChatInput((prev) => (prev ? prev + " " + ref : ref));
                }}
              />
            )}
          </div>
        </div>

        {/* Centre — Preview: width-scaled, vertical scroll reveals all pages */}
        <div ref={previewWrapRef} className="flex-1 min-w-0 bg-gray-200 overflow-x-hidden overflow-y-auto flex flex-col items-center py-6 relative">
          {!localDsl ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
              <LayoutGrid className="h-12 w-12 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No layout yet</p>
              <Button variant="outline" onClick={handleInitBlank} className="gap-2">
                <Plus className="h-4 w-4" /> Start with blank canvas
              </Button>
            </div>
          ) : (
            <div
              className="shadow-2xl ring-1 ring-black/10 shrink-0"
              style={{
                width: pageWidthPx * previewScale,
                height: iframeHeight * previewScale,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <iframe
                ref={iframeRef}
                title="design-preview"
                style={{
                  width: pageWidthPx,
                  height: iframeHeight,
                  border: "none",
                  display: "block",
                  transformOrigin: "top left",
                  transform: `scale(${previewScale})`,
                }}
                sandbox="allow-same-origin"
              />
            </div>
          )}
          {isLoadingPreview && (
            <span className="absolute bottom-3 right-4 text-xs text-muted-foreground animate-pulse">Rendering…</span>
          )}
        </div>

        {/* Drag handle to resize right panel */}
        <div
          onMouseDown={startResize}
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
        />

        {/* Right — Properties (collapsible) + Chat */}
        <div className="shrink-0 border-l flex flex-col" style={{ width: rightPanelWidth }}>

          {/* Properties header — click to collapse */}
          <div
            className="shrink-0 px-3 py-2 border-b flex items-center gap-2 cursor-pointer select-none hover:bg-muted/50"
            onClick={() => setPropertiesOpen((v) => !v)}
          >
            {propertiesOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Properties</p>
          </div>

          {/* Properties content */}
          {propertiesOpen && (
            <div className={showChat ? "overflow-y-auto shrink-0 max-h-64 border-b" : "flex-1 overflow-y-auto"}>
              <PropertiesPanel
                node={selectedNode}
                onUpdate={handleNodeUpdate}
                onDelete={handleNodeDelete}
                campaignId={campaignId}
              />
            </div>
          )}

          {/* Chat — takes remaining height when open */}
          {showChat && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* chat header */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">AI Design Chat</span>
                {chatMessages.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">{chatMessages.length}</span>
                )}
                {chatMessages.length > 0 && (
                  <button
                    title="New session — clears history so AI starts fresh"
                    onClick={async () => {
                      if (!confirm("Clear all chat history and start a new session?")) return;
                      await api.campaignStudio.clearDesignChat(campaignId, designId);
                      setChatMessages([]);
                    }}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-0.5"
                  >
                    New session
                  </button>
                )}
                <button
                  onClick={() => setShowChat(false)}
                  className={chatMessages.length > 0 ? "text-muted-foreground hover:text-foreground" : "ml-auto text-muted-foreground hover:text-foreground"}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* messages */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-4">
                    Describe what you want — the AI will build or modify the design.
                  </p>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {m.role === "user" ? (
                        m.content
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                            li: ({ children }) => <li>{children}</li>,
                            code: ({ children }) => <code className="bg-background/60 rounded px-1 py-0.5 text-[11px] font-mono">{children}</code>,
                            a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline text-primary">{children}</a>,
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-1.5 rounded border border-border/60">
                                <table className="w-full text-[11px] border-collapse">{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => <thead className="bg-background/50">{children}</thead>,
                            tr: ({ children }) => <tr className="border-b border-border/60 last:border-0">{children}</tr>,
                            th: ({ children }) => <th className="text-left font-semibold px-2 py-1 whitespace-nowrap">{children}</th>,
                            td: ({ children }) => <td className="px-2 py-1 whitespace-nowrap">{children}</td>,
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* input — Enter sends, Shift+Enter newline */}
              <div className="shrink-0 px-3 py-2 border-t flex gap-2 items-end">
                <textarea
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden leading-5"
                  placeholder="Describe what to change…"
                  value={chatInput}
                  rows={1}
                  style={{ maxHeight: 100 }}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSend();
                    }
                  }}
                  disabled={isChatLoading}
                />
                <Button
                  size="sm"
                  className="shrink-0 gap-1 h-8"
                  onClick={handleChatSend}
                  disabled={isChatLoading || !chatInput.trim()}
                >
                  {isChatLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
