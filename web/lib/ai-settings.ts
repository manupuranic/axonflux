export const PROVIDERS = ["anthropic", "openai", "openrouter"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const ALLOWED_MODELS_BY_PROVIDER: Record<Provider, string[]> = {
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  openrouter: [
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-sonnet-5",
    "anthropic/claude-opus-4-7",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
    "deepseek/deepseek-chat",
    "meta-llama/llama-3.1-70b-instruct",
  ],
};

export function getAiDefaults(): { provider: string; model: string } {
  if (typeof window === "undefined") return { provider: "openrouter", model: "" };
  const provider = localStorage.getItem("axonflux_ai_provider") ?? "openrouter";
  const raw = localStorage.getItem("axonflux_ai_model") ?? "";
  // strip stale "provider:model" compound format from old dropdown (e.g. "openrouter:openai/gpt-4o")
  const knownPrefixes = ["anthropic:", "openai:", "openrouter:"];
  const model = knownPrefixes.some((p) => raw.startsWith(p) && raw !== p)
    ? raw.slice(raw.indexOf(":") + 1)
    : raw.endsWith(":") ? "" : raw;
  return { provider, model };
}
