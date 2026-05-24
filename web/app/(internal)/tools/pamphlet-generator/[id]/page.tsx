"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/pamphlet/ChatPanel";
import { PreviewIframe } from "@/components/pamphlet/PreviewIframe";
import { HistoryDrawer } from "@/components/pamphlet/HistoryDrawer";
import { sendChatMessage, exportPdf } from "@/lib/pamphlet/api";

export default function PamphletEditorPage() {
  const params = useParams();
  const router = useRouter();
  const pamphletId = params.id as string;

  const [dsl, setDsl] = useState<object | null>(null);
  const [theme, setTheme] = useState<object | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [title, setTitle] = useState("Pamphlet");

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`/api/tools/pamphlets/${pamphletId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setTitle(data.title ?? "Pamphlet");
        if (!data.template_dsl && data.template_type !== "dsl") {
          router.replace(`/tools/pamphlet-generator/${pamphletId}/legacy`);
        } else {
          setDsl(data.template_dsl);
          setTheme(data.theme);
        }
      })
      .catch(console.error);
  }, [pamphletId]);

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

  async function handleExportPdf() {
    setExporting(true);
    try {
      const blob = await exportPdf(pamphletId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Export failed";
      alert(`Export failed: ${msg}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/tools/pamphlet-generator")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-sm font-semibold flex-1 truncate">{title}</h1>
        <HistoryDrawer pamphletId={pamphletId} onRestore={() => setPreviewKey((k) => k + 1)} />
        <Button size="sm" onClick={handleExportPdf} disabled={exporting || !dsl} className="gap-1">
          <Download className="w-4 h-4" />
          {exporting ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[30%] min-w-[280px] flex flex-col overflow-hidden">
          <ChatPanel
            pamphletId={pamphletId}
            onDslUpdate={handleDslUpdate}
            onSend={handleSend}
          />
        </div>
        <div className="flex-1 overflow-auto">
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
