"use client";
import { useRef, useState, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelDropdown } from "./ModelDropdown";
import { ToolCallPill } from "./ToolCallPill";
import { ChatResponse, ToolCallInfo } from "@/lib/pamphlet/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
}

interface Props {
  pamphletId: string;
  onDslUpdate: (dsl: object, theme: object) => void;
  onSend: (message: string, provider: string, model: string) => Promise<ChatResponse>;
}

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export function ChatPanel({ pamphletId, onDslUpdate, onSend }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [model, setModel] = useState(DEFAULT_MODEL);
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
            <div className={`rounded-lg px-3 py-2 text-sm max-w-[90%] whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {msg.content}
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="flex flex-wrap gap-1 max-w-[90%]">
                {msg.toolCalls.map((tc, j) => <ToolCallPill key={j} toolCall={tc} />)}
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
            className="min-h-[60px] max-h-32 resize-none text-sm"
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
