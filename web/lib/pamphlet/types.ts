export type NodeLang = "en" | "hi" | "kn";

export interface StyleOverrides {
  font_size_token?: "xs"|"sm"|"md"|"lg"|"xl"|"2xl";
  font_size_px?: number;
  font_weight?: "regular"|"medium"|"bold";
  color_token?: string;
  color_hex?: string;
  text_align?: "left"|"center"|"right";
  padding_token?: "xs"|"sm"|"md"|"lg";
  margin_token?: "xs"|"sm"|"md"|"lg";
}

export interface AnyNode {
  type: string;
  id: string;
  children?: AnyNode[];
  [key: string]: unknown;
}

export interface PamphletTheme {
  preset?: string;
  overrides?: Record<string, Record<string, string>>;
  title?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | null;
}

export interface ToolCallInfo {
  tool_name: string;
  args: Record<string, unknown>;
  result: unknown;
  is_error: boolean;
}

export interface ChatResponse {
  assistant_text: string | null;
  tool_calls: ToolCallInfo[];
  version_id: string | null;
  dsl: AnyNode;
  theme: PamphletTheme;
  cost_usd: number;
  provider: string;
  model: string;
}

export interface VersionInfo {
  id: string;
  pamphlet_id: string;
  edit_summary: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ModelInfo {
  provider: string;
  model: string;
  display_name: string;
}
