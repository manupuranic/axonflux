"use client";

import Link from "next/link";
import { FEATURES } from "@/lib/academy/features";
import { Eyebrow } from "@/components/academy/ui";

const STATUS_CLS: Record<string, string> = {
  shipped: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "in-progress": "bg-amber-50 text-amber-700 border-amber-200",
  planned: "bg-gray-50 text-gray-500 border-gray-200",
};

export default function FeaturesPage() {
  return (
    <div>
      <Eyebrow>Feature explorer</Eyebrow>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Every major feature as a case study: the problem, the flows, the theory it
        exercises, and how to defend it under questioning.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Link
            key={f.id}
            href={`/academy/features/${f.id}`}
            className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-[#1b293e] group-hover:text-[#105dff]">
                {f.title}
              </h2>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[f.status]}`}>
                {f.status}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600">{f.problem}</p>
            <div className="mt-3 font-mono text-[11px] text-gray-400">
              {f.theory.length} theory topics · {f.interview.length} interview angles
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
