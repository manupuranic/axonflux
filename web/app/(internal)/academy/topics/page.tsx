"use client";

// Theory Roadmap — every concept hidden inside the project, searchable.

import Link from "next/link";
import { useMemo, useState } from "react";
import { TOPICS } from "@/lib/academy/topics";
import { DOMAIN_META, type Domain } from "@/lib/academy/types";
import { useProgress } from "@/lib/academy/progress";
import { ConfidenceDot, DifficultyBadge, Eyebrow, StatusBadge } from "@/components/academy/ui";
import { Search } from "lucide-react";

const DOMAINS: (Domain | "all")[] = ["all", "cs", "data", "backend", "systems", "ml", "ai"];

export default function TopicsPage() {
  const { confidenceOf } = useProgress();
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<Domain | "all">("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TOPICS.filter((t) => {
      if (domain !== "all" && t.domain !== domain) return false;
      if (!needle) return true;
      return (
        t.title.toLowerCase().includes(needle) ||
        t.tagline.toLowerCase().includes(needle) ||
        t.id.includes(needle)
      );
    });
  }, [q, domain]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Theory roadmap</Eyebrow>
          <p className="mt-1 text-sm text-gray-500">
            {TOPICS.length} concepts extracted from the codebase. Solid nodes are fully
            written; dashed “frontier” topics deepen when their phase is built.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search topics…"
              className="rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {DOMAINS.map((d) => (
          <button
            key={d}
            onClick={() => setDomain(d)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              domain === d
                ? "bg-[#1b293e] text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {d === "all" ? "All domains" : DOMAIN_META[d].label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/academy/topics/${t.id}`}
            className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: DOMAIN_META[t.domain].color }}
              />
              <span className="flex-1 text-sm font-semibold leading-snug text-[#1b293e] group-hover:text-[#105dff]">
                {t.title}
              </span>
              <ConfidenceDot level={confidenceOf(t.id)} />
            </div>
            <p className="mt-1.5 text-xs italic text-gray-500">“{t.tagline}”</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <DifficultyBadge level={t.difficulty} />
              <StatusBadge status={t.status} />
            </div>
          </Link>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-gray-500">
          No topics match “{q}”. Try a broader term.
        </p>
      )}
    </div>
  );
}
