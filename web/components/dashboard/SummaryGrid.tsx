"use client";

import {
  TrendingUp, TrendingDown, Receipt, ShoppingCart, CreditCard,
  Zap, PackageX, BarChart3, Package, CalendarDays,
  Users, RefreshCcw, UserPlus, Store,
} from "lucide-react";
import { formatInrCompact, formatQty } from "@/lib/formatters";
import type { AnalyticsSummary } from "@/types/api";
import { KpiCard } from "./KpiCard";
import { format } from "date-fns";

interface SummaryGridProps {
  data: AnalyticsSummary;
}

const sz = "h-5 w-5";

export function SummaryGrid({ data }: SummaryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard title="7-Day Revenue"     value={formatInrCompact(data.total_revenue_last_7d)}  accent="green"  icon={<TrendingUp className={sz} />} />
      <KpiCard title="Total Bills (7d)"  value={formatQty(data.total_bills_last_7d)}            accent="blue"   icon={<Receipt className={sz} />} />
      <KpiCard title="7-Day Purchases"   value={formatInrCompact(data.total_purchases_last_7d)} accent="purple" icon={<ShoppingCart className={sz} />} />
      <KpiCard title="Credit Issued (7d)" value={formatInrCompact(data.total_credit_last_7d)}  accent="yellow" icon={<CreditCard className={sz} />} />

      <KpiCard title="Fast Moving"  value={data.fast_moving_count}  accent="green"  icon={<Zap className={sz} />} />
      <KpiCard title="Slow Moving"  value={data.slow_moving_count}  accent="yellow" icon={<TrendingDown className={sz} />} />
      <KpiCard title="Dead Stock"   value={data.dead_stock_count}   accent="red"    icon={<PackageX className={sz} />} />
      <KpiCard title="Demand Spike" value={data.demand_spike_count} accent="purple" icon={<BarChart3 className={sz} />} />

      <KpiCard
        title="Needs Reorder"
        value={data.products_needing_reorder}
        accent={data.products_needing_reorder > 0 ? "red" : "green"}
        icon={<Package className={sz} />}
      />
      <KpiCard
        title="Data As Of"
        value={data.latest_date ? format(new Date(data.latest_date), "d MMM yyyy") : "—"}
        accent="blue"
        icon={<CalendarDays className={sz} />}
      />
      <KpiCard title="Unique Customers"  value={data.total_unique_customers.toLocaleString("en-IN")}                              accent="blue"   icon={<Users className={sz} />} />
      <KpiCard title="Repeat Customers"  value={data.repeat_customer_percent != null ? `${data.repeat_customer_percent}%` : "—"} accent="green"  icon={<RefreshCcw className={sz} />} />
      <KpiCard title="New (Last 30d)"    value={data.new_customers_last_30d.toLocaleString("en-IN")}                              accent="purple" icon={<UserPlus className={sz} />} />
      <KpiCard title="Walk-in Revenue"   value={data.walk_in_revenue_percent != null ? `${data.walk_in_revenue_percent}%` : "—"} accent="yellow" icon={<Store className={sz} />} />
    </div>
  );
}
