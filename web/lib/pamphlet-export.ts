import { pdf } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { Pamphlet } from "@/types/api";

async function getPDFBlob(pamphlet: Pamphlet): Promise<Blob> {
  const { PamphletPDFTemplate } = await import(
    "@/components/pamphlet/PamphletPDFTemplate"
  );
  const element = createElement(PamphletPDFTemplate, { pamphlet }) as ReactElement<DocumentProps>;
  return pdf(element).toBlob();
}

async function pdfToCanvases(blob: Blob, scale = 2): Promise<HTMLCanvasElement[]> {
  const pdfjsLib = await import("pdfjs-dist");
  // Use CDN worker to avoid bundling issues
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await blob.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const canvases: HTMLCanvasElement[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    canvases.push(canvas);
  }
  return canvases;
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function slugify(s: string) {
  return s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

export async function downloadPDF(pamphlet: Pamphlet) {
  const blob = await getPDFBlob(pamphlet);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(pamphlet.title)}_pamphlet.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPNGPerPage(pamphlet: Pamphlet) {
  const blob = await getPDFBlob(pamphlet);
  const canvases = await pdfToCanvases(blob, 2);
  canvases.forEach((c, i) =>
    downloadCanvas(c, `${slugify(pamphlet.title)}_page${i + 1}.png`)
  );
}

export async function downloadPNGMerged(pamphlet: Pamphlet) {
  const blob = await getPDFBlob(pamphlet);
  const canvases = await pdfToCanvases(blob, 2);
  if (canvases.length === 0) return;

  const w = canvases[0].width;
  const totalH = canvases.reduce((s, c) => s + c.height, 0);
  const merged = document.createElement("canvas");
  merged.width = w;
  merged.height = totalH;
  const ctx = merged.getContext("2d")!;
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height;
  }
  downloadCanvas(merged, `${slugify(pamphlet.title)}_merged.png`);
}
