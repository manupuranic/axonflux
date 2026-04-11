"use client";

import { formatInrCompact, formatQty } from "@/lib/formatters";
import type { AnalyticsSummary } from "@/types/api";
import { KpiCard } from "./KpiCard";
import { format } from "date-fns";

interface SummaryGridProps {
  data: AnalyticsSummary;
}

export function SummaryGrid({ data }: SummaryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard
        title="7-Day Revenue"
        value={formatInrCompact(data.total_revenue_last_7d)}
        accent="green"
        icon="📈"
      />

      <KpiCard
        title="Total Bills (7d)"
        value={formatQty(data.total_bills_last_7d)}
        accent="blue"
        icon="🧾"
      />

      <KpiCard
        title="7-Day Purchases"
        value={formatInrCompact(data.total_purchases_last_7d)}
        accent="purple"
        icon="🛒"
      />

      <KpiCard
        title="Credit Issued (7d)"
        value={formatInrCompact(data.total_credit_last_7d)}
        accent="yellow"
        icon="💳"
      />

      <KpiCard
        title="Fast Moving"
        value={data.fast_moving_count}
        accent="green"
        icon="⚡"
      />

      <KpiCard
        title="Slow Moving"
        value={data.slow_moving_count}
        accent="yellow"
        icon="🐢"
      />

      <KpiCard
        title="Dead Stock"
        value={data.dead_stock_count}
        accent="red"
        icon="💀"
      />

      <KpiCard
        title="Demand Spike"
        value={data.demand_spike_count}
        accent="purple"
        icon="📊"
      />

      <KpiCard
        title="Needs Reorder"
        value={data.products_needing_reorder}
        accent={data.products_needing_reorder > 0 ? "red" : "green"}
        icon="📦"
      />

      <KpiCard
        title="Data As Of"
        value={
          data.latest_date
            ? format(new Date(data.latest_date), "d MMM yyyy")
            : "—"
        }
        accent="blue"
        icon="📅"
      />
    </div>
  );
}
