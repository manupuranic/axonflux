"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  pamphletId: string;
  dsl: object | null;
  theme: object | null;
  refreshKey: number;
}

export function PreviewIframe({ pamphletId, dsl, theme, refreshKey }: Props) {
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!pamphletId) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = `/api/tools/pamphlets/${pamphletId}/preview-html?t=${refreshKey}&token=${token}`;
    }
  }, [refreshKey, pamphletId]);

  return (
    <div className="relative w-full h-full bg-muted/20 flex items-center justify-center overflow-auto">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin allow-scripts"
        className="shadow-lg"
        style={{ width: "297mm", height: "210mm", border: "none", transform: "scale(0.75)", transformOrigin: "top center" }}
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
