"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ALLOWED_MODELS_BY_PROVIDER, PROVIDERS } from "@/lib/ai-settings";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { getToken } from "@/lib/auth";

type TestResult = { ok: boolean; response?: string; error?: string; latency_ms: number } | null;

async function runTest(provider: string, model: string): Promise<TestResult> {
  const token = getToken();
  const res = await fetch("/api/ai/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model }),
  });
  return res.json();
}

async function fetchSuggestions(provider: string): Promise<string[]> {
  const token = getToken();
  const res = await fetch("/api/ai/models", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const all: { provider: string; model: string }[] = await res.json();
  return all.filter((m) => m.provider === provider).map((m) => m.model);
}

export default function AISettingsPage() {
  const [provider, setProvider] = useState("openrouter");
  const [model, setModel] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = localStorage.getItem("axonflux_ai_provider") ?? "openrouter";
    const m = localStorage.getItem("axonflux_ai_model") ?? "";
    setProvider(p);
    setModel(m);
  }, []);

  useEffect(() => {
    fetchSuggestions(provider).then(setSuggestions).catch(() => {});
    setModel(localStorage.getItem("axonflux_ai_model") ?? "");
    setResult(null);
  }, [provider]);

  async function handleTest() {
    if (!model) return;
    setTesting(true);
    setResult(null);
    try {
      const r = await runTest(provider, model);
      setResult(r);
    } catch (e: unknown) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Request failed", latency_ms: 0 });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    localStorage.setItem("axonflux_ai_provider", provider);
    localStorage.setItem("axonflux_ai_model", model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-xl font-bold">AI Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure which AI provider and model the pamphlet chat uses. Saved in browser storage.
        </p>
      </div>

      {/* Provider */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Provider</label>
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                provider === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Model</label>
        <input
          className="w-full border rounded-md px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider === "openrouter" ? "anthropic/claude-sonnet-4-6" : "claude-sonnet-4-6"}
          list="model-suggestions"
        />
        <datalist id="model-suggestions">
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Type any model ID or pick from suggestions above.
          {provider === "openrouter" && " OpenRouter format: provider/model-name"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 items-center">
        <Button onClick={handleTest} disabled={testing || !model} variant="outline">
          {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Test Connection
        </Button>
        <Button onClick={handleSave} disabled={!model}>
          {saved ? "Saved!" : "Save as Default"}
        </Button>
      </div>

      {/* Test result */}
      {result && (
        <div className={`rounded-md border p-4 text-sm space-y-1 ${result.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          <div className="flex items-center gap-2 font-medium">
            {result.ok
              ? <CheckCircle className="w-4 h-4 text-green-600" />
              : <XCircle className="w-4 h-4 text-red-600" />}
            {result.ok ? `Connected — ${result.latency_ms}ms` : "Connection failed"}
          </div>
          {result.ok && result.response && (
            <p className="text-muted-foreground">Response: <span className="font-mono">{result.response}</span></p>
          )}
          {!result.ok && result.error && (
            <p className="text-red-700 font-mono text-xs break-all">{result.error}</p>
          )}
        </div>
      )}

      {/* Key reminder */}
      <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-1">
        <p className="font-medium">API Keys (set in <code className="bg-muted px-1 rounded">.env</code>)</p>
        <ul className="text-muted-foreground space-y-0.5 text-xs">
          <li><code>ANTHROPIC_API_KEY</code> — for anthropic provider</li>
          <li><code>OPENAI_API_KEY</code> — for openai provider</li>
          <li><code>OPENROUTER_API_KEY</code> — for openrouter provider</li>
        </ul>
      </div>
    </div>
  );
}
