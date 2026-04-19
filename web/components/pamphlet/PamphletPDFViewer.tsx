"use client";

import { useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import { PamphletPDFTemplate } from "./PamphletPDFTemplate";
import type { Pamphlet } from "@/types/api";
import { Button } from "@/components/ui/button";
import { ChevronDown, FileDown, Image, Images, Loader2 } from "lucide-react";
import {
  downloadPDF,
  downloadPNGPerPage,
  downloadPNGMerged,
} from "@/lib/pamphlet-export";

type ExportFormat = "pdf" | "png-pages" | "png-merged";

export function PamphletPDFViewer({ pamphlet }: { pamphlet: Pamphlet }) {
  const [exporting, setExporting] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  if (pamphlet.items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm border rounded-lg bg-muted/20">
        Add products to see preview
      </div>
    );
  }

  const totalPages = Math.ceil(
    pamphlet.items.length / (pamphlet.rows * pamphlet.cols)
  );

  async function handleExport(format: ExportFormat) {
    setDropOpen(false);
    setExporting(true);
    try {
      if (format === "pdf") await downloadPDF(pamphlet);
      else if (format === "png-pages") await downloadPNGPerPage(pamphlet);
      else await downloadPNGMerged(pamphlet);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground">
          {pamphlet.items.length} products · {pamphlet.rows}×{pamphlet.cols} grid · {totalPages} page(s)
        </span>

        {/* Download dropdown */}
        <div className="relative">
          <Button
            size="sm"
            disabled={exporting}
            onClick={() => setDropOpen((v) => !v)}
            className="gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {exporting ? "Exporting…" : "Download"}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>

          {dropOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 bg-popover border rounded-md shadow-lg w-52 py-1">
                <button
                  onClick={() => handleExport("pdf")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <FileDown className="h-4 w-4 text-red-500" />
                  Download PDF
                </button>
                <button
                  onClick={() => handleExport("png-pages")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <Image className="h-4 w-4 text-blue-500" />
                  PNG — each page separately
                </button>
                <button
                  onClick={() => handleExport("png-merged")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <Images className="h-4 w-4 text-green-600" />
                  PNG — all pages merged
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* PDF preview — fills remaining space */}
      <PDFViewer className="flex-1 w-full rounded-lg border" style={{ minHeight: 0 }}>
        <PamphletPDFTemplate pamphlet={pamphlet} />
      </PDFViewer>
    </div>
  );
}
