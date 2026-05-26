"use client";
import { useRef, useState, useEffect } from "react";
import { Send, Loader2, CheckCircle, XCircle, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelDropdown } from "./ModelDropdown";
import { ToolCallPill } from "./ToolCallPill";
import { ChatResponse, PendingItemChange, ToolCallInfo } from "@/lib/pamphlet/types";
import { applyItemChanges } from "@/lib/pamphlet/api";
import { getAiDefaults } from "@/lib/ai-settings";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  pendingChanges?: PendingItemChange[];
  changesResolved?: boolean;
}

interface Props {
  pamphletId: string;
  onDslUpdate: (dsl: object, theme: object) => void;
  onSend: (message: string, provider: string, model: string) => Promise<ChatResponse>;
  onItemsApplied: () => void;
}

function ItemApprovalCard({
  pamphletId,
  changes,
  onApplied,
  onDismiss,
}: {
  pamphletId: string;
  changes: PendingItemChange[];
  onApplied: () => void;
  onDismiss: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      await applyItemChanges(pamphletId, changes);
      onApplied();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Apply failed");
      setApplying(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-background/80 p-3 text-xs space-y-2">
      <p className="font-semibold text-foreground">Pending product changes</p>
      <ul className="space-y-1">
        {changes.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            {c.action === "remove" ? (
              <>
                <Trash2 className="w-3 h-3 mt-0.5 text-destructive shrink-0" />
                <span className="text-destructive">Remove <strong>{c.item_name}</strong></span>
              </>
            ) : (
              <>
                <Pencil className="w-3 h-3 mt-0.5 text-amber-500 shrink-0" />
                <span className="text-foreground">
                  Update <strong>{c.item_name}</strong>
                  {c.fields && (
                    <span className="text-muted-foreground ml-1">
                      ({Object.entries(c.fields)
                        .map(([k, v]) => `${k === "mrp" ? "MRP" : k === "offer_price" ? "offer" : k}: ${v}`)
                        .join(", ")})
                    </span>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-destructive text-[11px]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={handleApply}
          disabled={applying}
        >
          {applying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckCircle className="w-3 h-3" />
          )}
          Apply Changes
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-muted-foreground"
          onClick={onDismiss}
          disabled={applying}
        >
          <XCircle className="w-3 h-3" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function ChatPanel({ pamphletId, onDslUpdate, onSend, onItemsApplied }: Props) {
  const defaults = typeof window !== "undefined" ? getAiDefaults() : { provider: "openrouter", model: "" };
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(defaults.provider);
  const [model, setModel] = useState(defaults.model);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const resp = await onSend(userMsg, provider, model);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: resp.assistant_text ?? "",
          toolCalls: resp.tool_calls,
          pendingChanges: resp.pending_item_changes?.length ? resp.pending_item_changes : undefined,
        },
      ]);
      onDslUpdate(resp.dsl, resp.theme);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function resolveChanges(msgIndex: number) {
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, changesResolved: true } : m))
    );
  }

  return (
    <div className="flex flex-col h-full border-r">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground">Model</span>
        <ModelDropdown
          value={`${provider}:${model}`}
          onChange={(p, m) => { setProvider(p); setModel(m); }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            Describe the pamphlet layout you want.<br />
            Try: &ldquo;Monsoon theme, offer banner in center, products around it&rdquo;
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`rounded-lg px-3 py-2 text-sm max-w-[90%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {msg.role === "user" ? (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                    li: ({ children }) => <li>{children}</li>,
                    code: ({ children }) => <code className="bg-background/50 rounded px-1 text-xs font-mono">{children}</code>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
              {msg.pendingChanges && !msg.changesResolved && (
                <ItemApprovalCard
                  pamphletId={pamphletId}
                  changes={msg.pendingChanges}
                  onApplied={() => {
                    resolveChanges(i);
                    onItemsApplied();
                  }}
                  onDismiss={() => resolveChanges(i)}
                />
              )}
              {msg.pendingChanges && msg.changesResolved && (
                <p className="mt-2 text-xs text-muted-foreground italic">Changes resolved.</p>
              )}
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="flex flex-col gap-1 max-w-[90%] w-full">
                <div className="flex flex-wrap gap-1">
                  {msg.toolCalls.map((tc, j) => <ToolCallPill key={j} toolCall={tc} />)}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                    Raw ({msg.toolCalls.length} tool call{msg.toolCalls.length !== 1 ? "s" : ""})
                  </summary>
                  <div className="mt-1 space-y-1">
                    {msg.toolCalls.map((tc, j) => (
                      <div key={j} className="rounded border bg-muted/50 p-2 font-mono text-[10px] overflow-x-auto">
                        <div className="font-semibold text-accent-foreground mb-1">{tc.tool_name}</div>
                        <div className="text-muted-foreground mb-0.5">args:</div>
                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(tc.args, null, 2)}</pre>
                        <div className={`text-muted-foreground mt-1 mb-0.5 ${tc.is_error ? "text-destructive" : ""}`}>result:</div>
                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(tc.result, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
            placeholder="Describe a change..."
            className="min-h-15 max-h-32 resize-none text-sm"
            disabled={loading}
          />
          <Button size="icon" onClick={handleSend} disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
