"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Highlighter = dynamic(
  async () => {
    const { Light } = await import("react-syntax-highlighter");
    const sql = (await import("react-syntax-highlighter/dist/esm/languages/hljs/sql")).default;
    const python = (await import("react-syntax-highlighter/dist/esm/languages/hljs/python")).default;
    const ts = (await import("react-syntax-highlighter/dist/esm/languages/hljs/typescript")).default;
    const bash = (await import("react-syntax-highlighter/dist/esm/languages/hljs/bash")).default;
    Light.registerLanguage("sql", sql);
    Light.registerLanguage("python", python);
    Light.registerLanguage("typescript", ts);
    Light.registerLanguage("bash", bash);
    return Light;
  },
  { ssr: false, loading: () => <FallbackPre /> }
);

function FallbackPre() {
  return (
    <pre className="rounded-xl bg-slate-950 text-slate-100 text-[12.5px] p-5 overflow-x-auto leading-relaxed font-mono">
      <code className="opacity-50">Loading…</code>
    </pre>
  );
}

const theme = {
  hljs: {
    display: "block",
    overflowX: "auto",
    padding: "1.25rem",
    color: "#e2e8f0",
    background: "transparent",
    fontSize: "12.5px",
    lineHeight: "1.7",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  "hljs-keyword": { color: "#c4b5fd", fontWeight: "600" },
  "hljs-built_in": { color: "#7dd3fc" },
  "hljs-type": { color: "#7dd3fc" },
  "hljs-literal": { color: "#fca5a5" },
  "hljs-number": { color: "#fca5a5" },
  "hljs-string": { color: "#86efac" },
  "hljs-comment": { color: "#64748b", fontStyle: "italic" },
  "hljs-doctag": { color: "#64748b" },
  "hljs-meta": { color: "#94a3b8" },
  "hljs-title": { color: "#fbbf24" },
  "hljs-name": { color: "#fbbf24" },
  "hljs-attr": { color: "#7dd3fc" },
  "hljs-function": { color: "#fbbf24" },
  "hljs-operator": { color: "#94a3b8" },
  "hljs-punctuation": { color: "#94a3b8" },
};

export function CodeBlock({
  code,
  language = "sql",
}: {
  code: string;
  language?: "sql" | "python" | "typescript" | "bash";
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <FallbackPre />;

  return (
    <div className="rounded-xl bg-slate-950 ring-1 ring-slate-800 overflow-hidden">
      <Highlighter
        language={language}
        style={theme as Record<string, React.CSSProperties>}
        customStyle={{ background: "transparent", margin: 0 }}
        wrapLongLines={false}
      >
        {code}
      </Highlighter>
    </div>
  );
}
