"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { MotionRoot, m } from "./motion";
import { Hero } from "./sections/Hero";
import { ProblemStatement } from "./sections/ProblemStatement";
import { ArchitectureDiagram } from "./sections/ArchitectureDiagram";
import { LayerCards } from "./sections/LayerCards";

const PipelineStepper = dynamic(() => import("./sections/PipelineStepper").then((m) => m.PipelineStepper), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const DataFlowWalkthrough = dynamic(() => import("./sections/DataFlowWalkthrough").then((m) => m.DataFlowWalkthrough), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const CodebaseTree = dynamic(() => import("./sections/CodebaseTree").then((m) => m.CodebaseTree), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const SqlDeepDive = dynamic(() => import("./sections/SqlDeepDive").then((m) => m.SqlDeepDive), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const ConceptsGrid = dynamic(() => import("./sections/ConceptsGrid").then((m) => m.ConceptsGrid), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const Tradeoffs = dynamic(() => import("./sections/Tradeoffs").then((m) => m.Tradeoffs), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const FailureCases = dynamic(() => import("./sections/FailureCases").then((m) => m.FailureCases), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const Scaling = dynamic(() => import("./sections/Scaling").then((m) => m.Scaling), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const Roadmap = dynamic(() => import("./sections/Roadmap").then((m) => m.Roadmap), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const InterviewMode = dynamic(() => import("./sections/InterviewMode").then((m) => m.InterviewMode), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const Changelog = dynamic(() => import("./sections/Changelog").then((m) => m.Changelog), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});
const Bonus = dynamic(() => import("./sections/Bonus").then((m) => m.Bonus), {
  ssr: false,
  loading: () => <SectionSkeleton />,
});

function SectionSkeleton() {
  return (
    <div className="py-16 space-y-3 animate-pulse">
      <div className="h-8 w-1/3 bg-slate-200 rounded" />
      <div className="h-4 w-2/3 bg-slate-100 rounded" />
      <div className="h-64 w-full bg-slate-100 rounded-xl mt-6" />
    </div>
  );
}

const NAV: { id: string; label: string }[] = [
  { id: "hero", label: "Overview" },
  { id: "problem", label: "Problem" },
  { id: "architecture", label: "Architecture" },
  { id: "layers", label: "Three Layers" },
  { id: "pipeline", label: "Pipeline" },
  { id: "dataflow", label: "Data Flow" },
  { id: "codebase", label: "Codebase" },
  { id: "sql", label: "SQL Deep Dive" },
  { id: "concepts", label: "Concepts" },
  { id: "tradeoffs", label: "Trade-offs" },
  { id: "failures", label: "Edge Cases" },
  { id: "scaling", label: "Scaling" },
  { id: "roadmap", label: "Roadmap" },
  { id: "interview", label: "Interview Mode" },
  { id: "changelog", label: "Changelog" },
  { id: "bonus", label: "Bonus" },
];

export function ExplainerPage() {
  const [activeId, setActiveId] = useState<string>("hero");
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Scroll-spy: pick the last section whose top has crossed the trigger line
  useEffect(() => {
    const TRIGGER_PX = 140;

    function update() {
      let active = NAV[0].id;
      for (const n of NAV) {
        const el = document.getElementById(n.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - TRIGGER_PX <= 0) active = n.id;
        else break;
      }
      setActiveId(active);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Top progress bar
  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (max > 0) setProgress((doc.scrollTop / max) * 100);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <MotionRoot>
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-transparent z-50 pointer-events-none">
        <m.div
          className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-slate-800 origin-left"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div ref={containerRef} className="relative">
        <div className="flex gap-10">
          {/* Sticky nav */}
          <aside className="hidden lg:block w-56 shrink-0">
            <nav className="sticky top-6 space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-3 px-2">
                On this page
              </p>
              {NAV.map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  className={cn(
                    "block text-sm px-3 py-1.5 rounded-md transition-all relative",
                    activeId === n.id
                      ? "text-blue-700 font-medium bg-blue-50"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  {activeId === n.id && (
                    <m.span
                      layoutId="nav-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  {n.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Main scroll container */}
          <main className="flex-1 min-w-0 max-w-3xl">
            <Hero />
            <ProblemStatement />
            <ArchitectureDiagram />
            <LayerCards />
            <PipelineStepper />
            <DataFlowWalkthrough />
            <CodebaseTree />
            <SqlDeepDive />
            <ConceptsGrid />
            <Tradeoffs />
            <FailureCases />
            <Scaling />
            <Roadmap />
            <InterviewMode />
            <Changelog />
            <Bonus />
          </main>
        </div>
      </div>
    </MotionRoot>
  );
}
