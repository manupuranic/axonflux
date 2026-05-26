"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, ImageIcon, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/pamphlet/ChatPanel";
import { PreviewIframe } from "@/components/pamphlet/PreviewIframe";
import { HistoryDrawer } from "@/components/pamphlet/HistoryDrawer";
import { ProductsPanel } from "@/components/pamphlet/ProductsPanel";
import { sendChatMessage, exportPdf, exportImage } from "@/lib/pamphlet/api";
import { PamphletItem } from "@/lib/pamphlet/types";
import { getToken } from "@/lib/auth";

export default function PamphletEditorPage() {
  const params = useParams();
  const router = useRouter();
  const pamphletId = params.id as string;

  const [dsl, setDsl] = useState<object | null>(null);
  const [theme, setTheme] = useState<object | null>(null);
  const [items, setItems] = useState<PamphletItem[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [exporting, setExporting] = useState<"pdf" | "img" | null>(null);
  const [title, setTitle] = useState("Pamphlet");

  const loadPamphlet = useCallback(() => {
    const token = getToken();
    fetch(`/api/tools/pamphlets/${pamphletId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) { router.replace("/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setTitle(data.title ?? "Pamphlet");
        setItems(data.items ?? []);
        if (!data.template_dsl && data.template_type !== "dsl") {
          router.replace(`/tools/pamphlet-generator/${pamphletId}/legacy`);
        } else {
          setDsl(data.template_dsl);
          setTheme(data.theme);
        }
      })
      .catch(console.error);
  }, [pamphletId, router]);

  useEffect(() => { loadPamphlet(); }, [loadPamphlet]);

  const handleDslUpdate = useCallback((newDsl: object, newTheme: object) => {
    setDsl(newDsl);
    setTheme(newTheme);
    setPreviewKey((k) => k + 1);
  }, []);

  const handleSend = useCallback(
    (message: string, provider: string, model: string) =>
      sendChatMessage(pamphletId, message, provider, model),
    [pamphletId]
  );

  const handleItemsChange = useCallback(() => {
    loadPamphlet();
    setPreviewKey((k) => k + 1);
  }, [loadPamphlet]);

  async function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    setExporting("pdf");
    try {
      const blob = await exportPdf(pamphletId);
      await triggerDownload(blob, `${title}.pdf`);
    } catch (e: unknown) {
      alert(`PDF export failed: ${e instanceof Error ? e.message : e}`);
    } finally { setExporting(null); }
  }

  async function handleExportImage() {
    setExporting("img");
    try {
      const blob = await exportImage(pamphletId);
      await triggerDownload(blob, `${title}.png`);
    } catch (e: unknown) {
      alert(`Image export failed: ${e instanceof Error ? e.message : e}`);
    } finally { setExporting(null); }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/tools/pamphlet-generator")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-sm font-semibold flex-1 truncate">{title}</h1>
        <HistoryDrawer pamphletId={pamphletId} onRestore={() => setPreviewKey((k) => k + 1)} />
        <Button size="sm" variant="outline" onClick={handleExportImage} disabled={!!exporting || !dsl} className="gap-1">
          <ImageIcon className="w-4 h-4" />
          {exporting === "img" ? "Exporting..." : "PNG"}
        </Button>
        <Button size="sm" onClick={handleExportPdf} disabled={!!exporting || !dsl} className="gap-1">
          <Download className="w-4 h-4" />
          {exporting === "pdf" ? "Exporting..." : "PDF"}
        </Button>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat — 25% */}
        <div className="w-[25%] min-w-55 max-w-[320px] flex flex-col overflow-hidden shrink-0">
          <ChatPanel
            pamphletId={pamphletId}
            onDslUpdate={handleDslUpdate}
            onSend={handleSend}
          />
        </div>

        {/* Products — 22% */}
        <div className="w-[22%] min-w-50 max-w-70 flex flex-col overflow-hidden shrink-0">
          <ProductsPanel
            pamphletId={pamphletId}
            initialItems={items}
            onItemsChange={handleItemsChange}
          />
        </div>

        {/* Preview — remaining */}
        <div className="flex-1 overflow-auto min-w-0 bg-muted/20">
          <PreviewIframe
            pamphletId={pamphletId}
            dsl={dsl}
            theme={theme}
            refreshKey={previewKey}
          />
        </div>
      </div>
    </div>
  );
}
