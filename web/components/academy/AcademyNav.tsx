"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: { href: string; label: string }[] = [
  { href: "/academy", label: "Overview" },
  { href: "/academy/graph", label: "Synapse Map" },
  { href: "/academy/architecture", label: "Architecture" },
  { href: "/academy/path", label: "Learning Path" },
  { href: "/academy/topics", label: "Theory" },
  { href: "/academy/features", label: "Features" },
  { href: "/academy/rebuild", label: "Rebuild Mode" },
  { href: "/academy/interview", label: "Interview" },
  { href: "/academy/roadmap", label: "Roadmap" },
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

      <nav className="mt-4 -mx-1 flex gap-1 overflow-x-auto pb-1">
        {SECTIONS.map((s) => {
          const active =
            s.href === "/academy"
              ? pathname === "/academy"
              : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#1b293e] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
