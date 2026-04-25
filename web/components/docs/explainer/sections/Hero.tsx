"use client";

import { fadeInUp, m, stagger } from "../motion";

const STATS = [
  { label: "Raw rows", value: "auditable", note: "every row → batch_id + file" },
  { label: "Derived rows", value: "~2.3M", note: "dense (date × product) series" },
  { label: "Pipeline steps", value: "10", note: "deterministic SQL chain" },
  { label: "Source of truth", value: "raw.*", note: "append-only, never mutated" },
];

export function Hero() {
  return (
    <section id="hero" className="relative scroll-mt-24 pt-12 pb-20">
      {/* Gradient backdrop */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute -top-40 -left-20 h-96 w-96 rounded-full bg-blue-300/30 blur-3xl" />
        <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-slate-400/30 blur-3xl" />
        <div className="absolute top-40 left-1/3 h-72 w-72 rounded-full bg-cyan-200/30 blur-3xl" />
      </div>

      <m.div
        variants={stagger(0.1)}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        <m.div variants={fadeInUp}>
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/70 backdrop-blur px-3 py-1 text-xs font-medium text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Living document · v1.0 · 2026-04-25
          </span>
        </m.div>

        <m.h1
          variants={fadeInUp}
          className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]"
        >
          A billing system{" "}
          <span className="bg-gradient-to-br from-blue-600 via-blue-700 to-slate-900 bg-clip-text text-transparent">
            with no API
          </span>
          ,
          <br />
          turned into a self-rebuilding analytics platform.
        </m.h1>

        <m.p
          variants={fadeInUp}
          className="text-lg md:text-xl text-slate-600 max-w-2xl leading-relaxed"
        >
          AxonFlux ingests CSV exports into an immutable raw layer, deterministically rebuilds an
          analytical layer in Postgres, and serves it through a FastAPI + Next.js stack — with
          operational tools layered on top.
        </m.p>

        <m.div variants={fadeInUp} className="flex flex-wrap gap-3 pt-2">
          <a
            href="#architecture"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Explore architecture
            <span aria-hidden>→</span>
          </a>
          <a
            href="#interview"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 backdrop-blur px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors"
          >
            Interview mode
          </a>
        </m.div>

        <m.div
          variants={fadeInUp}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-8"
        >
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200 bg-white/70 backdrop-blur px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                {s.label}
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{s.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{s.note}</p>
            </div>
          ))}
        </m.div>
      </m.div>
    </section>
  );
}
