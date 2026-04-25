"use client";

import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";

export function Bonus() {
  return (
    <Section
      id="bonus"
      eyebrow="One more thing"
      title="ELI5 + 30-second pitch"
      description="When you've explained AxonFlux fifty times and need it on autopilot."
    >
      <m.div
        variants={stagger(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <m.div variants={fadeInUp} className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-slate-100 p-6">
          <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-slate-300/40 blur-2xl" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-700 mb-2">
              💡 Explain like I'm 5
            </p>
            <p className="text-[14.5px] text-slate-700 leading-relaxed">
              A supermarket has a billing computer. It can write its sales onto pieces of paper, but it
              can't talk to other computers. Every night, someone takes the papers and puts them in a
              special box. Every morning, a machine reads everything in the box, makes a big tidy chart
              of what sold, what's running out, and which customers came back, and shows it on a screen.
              If the machine ever makes a mistake, we just teach it the right way and it remakes the
              chart from scratch — the box of papers is never thrown away.
            </p>
          </div>
        </m.div>

        <m.div variants={fadeInUp} className="relative overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-blue-500/20 blur-2xl" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-300 mb-2">
              ⏱️ 30-second pitch
            </p>
            <p className="text-[14px] text-slate-200 leading-relaxed italic">
              "AxonFlux is a three-layer analytics platform on Postgres for a retail business that has
              no API. Raw exports go into an append-only schema with SHA-256 dedup and full audit. A
              nightly pipeline truncates and rebuilds an analytical layer with ten ordered SQL files —
              dense time series, rolling features, health signals, stock positions, supplier
              recommendations, customer dimensions, basket associations. A separate app schema holds
              human-authored state that survives rebuilds. FastAPI serves a Next.js dashboard, with
              operational tools plugged in via auto-discovered routers. The whole thing is
              deterministic — same raw inputs, same derived outputs, no hidden state — which means
              every analytical bug is one fix-and-rerun away from being correct historically."
            </p>
          </div>
        </m.div>
      </m.div>

      <m.div
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-3">
          🚦 How to use this document
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
          {[
            ["New to the codebase", "Overview → Architecture → Codebase → Data Flow"],
            ["Onboarding to extend a feature", "Three Layers → Codebase → SQL Deep Dive → Edge Cases"],
            ["Preparing for an interview", "Architecture → Concepts → Trade-offs → Interview Mode"],
            ["Debugging a bug", "Edge Cases → Scaling → SQL Deep Dive"],
            ["Pitching the project", "Overview → Interview Mode → 30-second pitch"],
          ].map(([role, path]) => (
            <div key={role} className="flex justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
              <span className="text-slate-600">{role}</span>
              <span className="text-slate-900 font-medium text-right">{path}</span>
            </div>
          ))}
        </div>
      </m.div>

      <m.p
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        className="mt-8 text-center text-[12px] text-slate-400"
      >
        Living document — updated in place. New features land in the Roadmap before they ship and the
        Changelog when they ship.
      </m.p>
    </Section>
  );
}
