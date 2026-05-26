"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const SCALE = 0.75;

interface Props {
  pamphletId: string;
  dsl: object | null;
  theme: object | null;
  refreshKey: number;
}

export function PreviewIframe({ pamphletId, dsl, theme, refreshKey }: Props) {
  const [loading, setLoading] = useState(false);
  const [contentHeight, setContentHeight] = useState(793); // ~A4 landscape px
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!pamphletId) return;
    const token = typeof window !== "undefined" ? (localStorage.getItem("axonflux_token") ?? "") : "";
    setLoading(true);
    setContentHeight(793);
    if (iframeRef.current) {
      iframeRef.current.style.height = "793px";
      iframeRef.current.src = `/api/tools/pamphlets/${pamphletId}/preview-html?t=${refreshKey}&token=${token}`;
    }
  }, [refreshKey, pamphletId]);

  function handleLoad() {
    setLoading(false);
    if (!iframeRef.current) return;
    try {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        if (h > 100) {
          iframeRef.current.style.height = h + "px";
          setContentHeight(h);
        }
      }
    } catch {}
  }

  // Wrapper height = visual height so outer scroll tracks visual content end, not dead space
  const wrapperHeight = Math.round(contentHeight * SCALE);

  return (
    <div className="relative w-full h-full bg-muted/20 overflow-auto">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="flex justify-center py-4">
        {/* Wrapper clips dead layout space caused by CSS transform scale */}
        <div style={{ width: `calc(297mm * ${SCALE})`, height: wrapperHeight, overflow: "visible", position: "relative" }}>
          <div style={{ transform: `scale(${SCALE})`, transformOrigin: "top left", width: "297mm", position: "absolute", top: 0, left: 0 }}>
            <iframe
              ref={iframeRef}
              sandbox="allow-same-origin allow-scripts"
              className="shadow-lg"
              style={{ width: "297mm", minHeight: "210mm", border: "none", display: "block" }}
              onLoad={handleLoad}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
