import { ChatResponse, VersionInfo, ModelInfo } from "./types";

const BASE = `/api/tools/pamphlets`;

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export async function sendChatMessage(
  pamphletId: string,
  message: string,
  provider?: string,
  model?: string
): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/${pamphletId}/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message, provider, model }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Chat failed");
  return res.json();
}

export async function listVersions(pamphletId: string): Promise<VersionInfo[]> {
  const res = await fetch(`${BASE}/${pamphletId}/versions`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load versions");
  return res.json();
}

export async function restoreVersion(pamphletId: string, versionId: string): Promise<VersionInfo> {
  const res = await fetch(`${BASE}/${pamphletId}/versions/${versionId}/restore`, {
    method: "POST", headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Restore failed");
  return res.json();
}

export async function exportPdf(pamphletId: string): Promise<Blob> {
  const res = await fetch(`${BASE}/${pamphletId}/export-pdf`, {
    method: "POST", headers: authHeaders(),
  });
  if (!res.ok) throw new Error("PDF export failed");
  return res.blob();
}

export function getPreviewUrl(pamphletId: string): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  return `${BASE}/${pamphletId}/preview-html?token=${token}`;
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load models");
  return res.json();
}
