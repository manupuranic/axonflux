import { getToken } from "@/lib/auth";
import { ChatResponse, VersionInfo, ModelInfo, PamphletItem, AgentTask } from "./types";

const BASE = `/api/tools/pamphlets`;

function authHeaders(): HeadersInit {
  const token = getToken();
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

export async function exportImage(pamphletId: string): Promise<Blob> {
  const res = await fetch(`${BASE}/${pamphletId}/export-image`, {
    method: "POST", headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Image export failed");
  return res.blob();
}

export function getPreviewUrl(pamphletId: string): string {
  const token = getToken() ?? "";
  return `${BASE}/${pamphletId}/preview-html?token=${token}`;
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load models");
  return res.json();
}

export async function addItem(
  pamphletId: string,
  item: Partial<PamphletItem>
): Promise<PamphletItem> {
  const res = await fetch(`${BASE}/${pamphletId}/items`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Add item failed");
  return res.json();
}

export async function updateItem(
  pamphletId: string,
  itemId: string,
  patch: Partial<PamphletItem>
): Promise<PamphletItem> {
  const res = await fetch(`${BASE}/${pamphletId}/items/${itemId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Update item failed");
  return res.json();
}

export async function removeItem(pamphletId: string, itemId: string): Promise<void> {
  const res = await fetch(`${BASE}/${pamphletId}/items/${itemId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Remove item failed");
}

export async function reorderItems(pamphletId: string, orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      fetch(`${BASE}/${pamphletId}/items/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ sort_order: index }),
      })
    )
  );
}

export async function triggerImageScan(
  pamphletId: string
): Promise<{ task_id: string | null; count: number; message?: string }> {
  const res = await fetch(`/api/agents/image/scan-all/${pamphletId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Scan trigger failed");
  return res.json();
}

export function streamAgentTask(
  taskId: string,
  onUpdate: (task: AgentTask) => void,
  onDone: () => void
): () => void {
  const token = getToken() ?? "";
  const source = new EventSource(`/api/agents/tasks/${taskId}/stream?token=${encodeURIComponent(token)}`);
  source.onmessage = (e) => {
    const task: AgentTask = JSON.parse(e.data);
    onUpdate(task);
    if (task.status === "done" || task.status === "error") {
      source.close();
      onDone();
    }
  };
  source.onerror = () => {
    source.close();
    onDone();
  };
  return () => source.close();
}
