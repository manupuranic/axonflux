"use client";
import { useEffect, useRef, useState } from "react";
import { listModels } from "@/lib/pamphlet/api";
import { ModelInfo } from "@/lib/pamphlet/types";
import { ChevronDown } from "lucide-react";

interface Props {
  value: string;
  onChange: (provider: string, model: string) => void;
}

function providerFromModel(model: string): string {
  if (model.includes("/")) return "openrouter";
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  return "anthropic";
}

export function ModelDropdown({ value, onChange }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listModels().then(setModels).catch(console.error);
    const saved = localStorage.getItem("axonflux_ai_model");
    // discard stale "provider:" values from old dropdown format
    if (saved && !saved.endsWith(":") && !value) setInput(saved);
  }, []);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function commit(model: string) {
    const provider = providerFromModel(model);
    setInput(model);
    setOpen(false);
    onChange(provider, model);
  }

  const filtered = input
    ? models.filter((m) => m.model.toLowerCase().includes(input.toLowerCase()))
    : models;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center h-7 border rounded-md bg-background px-2 gap-1 text-xs w-64">
        <input
          className="flex-1 outline-none bg-transparent text-xs"
          value={input}
          placeholder="provider/model or type to search"
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(input); if (e.key === "Escape") setOpen(false); }}
        />
        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" onClick={() => setOpen((v) => !v)} />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full mt-1 left-0 z-50 w-80 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.map((m) => (
            <div
              key={`${m.provider}:${m.model}`}
              className="px-3 py-1.5 text-xs cursor-pointer hover:bg-accent"
              onMouseDown={() => commit(m.model)}
            >
              <span className="text-muted-foreground mr-1.5">{m.provider}</span>
              {m.model}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
