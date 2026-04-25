"use client";

import { useState } from "react";
import { Section } from "../Section";
import { m } from "../motion";
import { cn } from "@/lib/utils";

type Node = {
  name: string;
  desc?: string;
  kind: "dir" | "file" | "group";
  children?: Node[];
  highlight?: "raw" | "derived" | "app" | "api" | "ui";
};

const TREE: Node = {
  name: "axonflux/",
  kind: "dir",
  children: [
    {
      name: "raw_ingestion/",
      kind: "dir",
      desc: "File → raw.* (do not modify)",
      highlight: "raw",
      children: [
        { name: "common/ingest_core.py", kind: "file", desc: "Chunked insert, dedup, batch tracking" },
        { name: "sales_itemwise/", kind: "dir" },
        { name: "sales_billwise/", kind: "dir" },
        { name: "purchase_itemwise/", kind: "dir" },
        { name: "purchase_billwise/", kind: "dir" },
        { name: "supplier_master/", kind: "dir" },
        { name: "item_combinations/", kind: "dir" },
      ],
    },
    {
      name: "sql/rebuild_derived/",
      kind: "dir",
      desc: "raw.* → derived.* (10 ordered SQL files)",
      highlight: "derived",
      children: [
        { name: "00_daily_sales_summary.sql", kind: "file" },
        { name: "01_product_daily_metrics.sql", kind: "file" },
        { name: "02_product_daily_features.sql", kind: "file" },
        { name: "03_product_health_signals.sql", kind: "file" },
        { name: "04_product_stock_position.sql", kind: "file" },
        { name: "05_necessary_views.sql", kind: "file" },
        { name: "06_supplier_restock_recommendations.sql", kind: "file" },
        { name: "07_daily_payment_breakdown.sql", kind: "file" },
        { name: "08_customer_dimension.sql", kind: "file" },
        { name: "09_customer_metrics.sql", kind: "file" },
        { name: "10_product_associations.sql", kind: "file" },
      ],
    },
    {
      name: "pipelines/weekly_pipeline.py",
      kind: "file",
      desc: "Orchestrates the rebuild",
      highlight: "derived",
    },
    {
      name: "api/",
      kind: "dir",
      desc: "FastAPI app",
      highlight: "api",
      children: [
        { name: "main.py", kind: "file" },
        { name: "dependencies.py", kind: "file", desc: "get_db / get_conn / current_user" },
        { name: "routers/", kind: "dir", desc: "auth · analytics · customers · products · suppliers · pipeline · docs" },
        { name: "tools/", kind: "dir", desc: "Plugin tools — auto-discovered" },
        { name: "models/app.py", kind: "file", desc: "SQLAlchemy ORM for app.*" },
        { name: "migrations/", kind: "dir", desc: "Alembic — app.* schema only" },
      ],
    },
    {
      name: "web/",
      kind: "dir",
      desc: "Next.js dashboard",
      highlight: "ui",
      children: [
        { name: "app/(internal)/", kind: "dir", desc: "Auth-gated routes" },
        { name: "components/", kind: "dir" },
        { name: "lib/api.ts", kind: "file", desc: "Typed API client" },
      ],
    },
    {
      name: "scripts/",
      kind: "dir",
      desc: "One-off & ops scripts",
      children: [
        { name: "ingest_all.py", kind: "file" },
        { name: "cluster_product_names.py", kind: "file", desc: "Entity resolution clustering" },
        { name: "er4u_export.py", kind: "file", desc: "Playwright auto-export" },
        { name: "create_admin.py", kind: "file" },
      ],
    },
    {
      name: "docs/",
      kind: "dir",
      desc: "Surfaced via /docs/library",
    },
  ],
};

const HIGHLIGHT_COLOR = {
  raw: "text-amber-700 bg-amber-50 border-amber-200",
  derived: "text-emerald-700 bg-emerald-50 border-emerald-200",
  app: "text-blue-700 bg-blue-50 border-blue-200",
  api: "text-slate-700 bg-slate-100 border-slate-200",
  ui: "text-cyan-700 bg-cyan-50 border-cyan-200",
};

export function CodebaseTree() {
  return (
    <Section
      id="codebase"
      eyebrow="Where things live"
      title="The codebase, by concern"
      description="Click a folder to expand. Color = which architectural layer it serves."
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 font-mono text-sm">
        <TreeNode node={TREE} depth={0} initialOpen />
      </div>
    </Section>
  );
}

function TreeNode({
  node,
  depth,
  initialOpen,
}: {
  node: Node;
  depth: number;
  initialOpen?: boolean;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const [open, setOpen] = useState(initialOpen ?? depth < 1);

  return (
    <div>
      <button
        onClick={() => hasChildren && setOpen(!open)}
        className={cn(
          "flex items-start gap-2 w-full text-left py-1 rounded-md px-2 -mx-2 transition-colors",
          hasChildren && "hover:bg-slate-50 cursor-pointer",
          !hasChildren && "cursor-default"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <m.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-slate-400 inline-block w-3 shrink-0 leading-tight mt-0.5"
          >
            ▶
          </m.span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-base shrink-0 leading-tight">
          {node.kind === "dir" ? (open ? "📂" : "📁") : "📄"}
        </span>
        <span
          className={cn(
            "text-slate-800 font-medium",
            node.kind === "file" && "text-slate-700 font-normal"
          )}
        >
          {node.name}
        </span>
        {node.highlight && (
          <span
            className={cn(
              "ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider",
              HIGHLIGHT_COLOR[node.highlight]
            )}
          >
            {node.highlight}
          </span>
        )}
        {node.desc && (
          <span className="font-sans text-[12px] text-slate-500 truncate ml-auto">
            {!node.highlight && node.desc}
          </span>
        )}
      </button>
      {node.desc && node.highlight && (
        <p
          className="font-sans text-[12px] text-slate-500 mt-0.5 mb-1"
          style={{ paddingLeft: `${depth * 16 + 36}px` }}
        >
          {node.desc}
        </p>
      )}
      {hasChildren && (
        <m.div
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: "hidden" }}
        >
          {node.children!.map((c) => (
            <TreeNode key={c.name} node={c} depth={depth + 1} />
          ))}
        </m.div>
      )}
    </div>
  );
}
