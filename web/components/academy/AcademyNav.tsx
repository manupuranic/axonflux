"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Grouped by the three V2 pillars: where am I going (civilization), do I
// understand it (constellation), how does my project work (atlas) — then the
// memory surfaces, then practice, then reference.
const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "",
    items: [{ href: "/academy", label: "Command Center" }],
  },
  {
    label: "Direction",
    items: [
      { href: "/academy/civilization", label: "Civilization" },
      { href: "/academy/capabilities", label: "Capabilities" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/academy/graph", label: "Constellation" },
      { href: "/academy/topics", label: "Theory" },
      { href: "/academy/path", label: "Learning Path" },
    ],
  },
  {
    label: "Project",
    items: [
      { href: "/academy/atlas", label: "Atlas" },
      { href: "/academy/deep-dive", label: "Deep Dive" },
    ],
  },
  {
    label: "Memory",
    items: [
      { href: "/academy/dna", label: "DNA" },
      { href: "/academy/decisions", label: "Decisions" },
      { href: "/academy/journal", label: "Journal" },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/academy/rebuild", label: "Rebuild" },
      { href: "/academy/interview", label: "Interview" },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "/academy/roadmap", label: "Roadmap" },
      { href: "/academy/library", label: "Library" },
    ],
  },
];

export function AcademyNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
            developer portal
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1b293e]">
            AxonFlux <span className="text-[#105dff]">Academy</span>
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          Own every decision. Rebuild it from memory.
        </p>
      </div>

      <nav className="mt-4 -mx-1 flex items-center gap-1 overflow-x-auto pb-1">
        {GROUPS.map((g, gi) => (
          <div key={g.label || "home"} className="flex items-center gap-1">
            {gi > 0 ? (
              <span
                className="mx-1 hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-gray-300 lg:inline"
                aria-hidden
              >
                {g.label}
              </span>
            ) : null}
            {g.items.map((s) => {
              const active =
                s.href === "/academy" ? pathname === "/academy" : pathname.startsWith(s.href);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-[#1b293e] text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
