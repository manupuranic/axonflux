"use client";

import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";

interface DocEntry {
  category: string;
  slug: string;
  filename: string;
  title: string;
}

export function DocsLibrary() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load doc list once
  useEffect(() => {
    (async () => {
      setListLoading(true);
      try {
        const data = await api.docs.list();
        setDocs(data);
        if (data.length > 0) {
          setActiveSlug(data[0].slug);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load doc list");
      } finally {
        setListLoading(false);
      }
    })();
  }, []);

  // Load content when activeSlug changes
  const loadContent = useCallback(async (slug: string) => {
    setContentLoading(true);
    setContent(null);
    try {
      const res = await api.docs.get(slug);
      setContent(res.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load doc");
    } finally {
      setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSlug) loadContent(activeSlug);
  }, [activeSlug, loadContent]);

  // Group docs by category
  const grouped = docs.reduce<Record<string, DocEntry[]>>((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  }, {});

  return (
    <div className="flex gap-6 h-[calc(100vh-180px)]">
      {/* Sidebar — doc list */}
      <aside className="w-64 shrink-0 border border-gray-200 rounded-lg bg-white overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold text-gray-900">Documentation</h2>
          <p className="text-xs text-gray-500 mt-0.5">{docs.length} docs</p>
        </div>
        {listLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <nav className="p-2">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-4">
                <p className="px-2 text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">
                  {category}
                </p>
                {items.map((doc) => (
                  <button
                    key={doc.slug}
                    onClick={() => setActiveSlug(doc.slug)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      activeSlug === doc.slug
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {doc.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
      </aside>

      {/* Content pane */}
      <div className="flex-1 min-w-0 border border-gray-200 rounded-lg bg-white overflow-y-auto">
        {error && (
          <div className="m-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {contentLoading ? (
          <div className="p-8 space-y-3">
            <div className="h-8 w-1/2 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
          </div>
        ) : content ? (
          <article className="markdown-body px-8 py-6 max-w-3xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        ) : !listLoading && docs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No documentation found.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
