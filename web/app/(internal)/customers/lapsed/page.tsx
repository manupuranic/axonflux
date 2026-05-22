"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { Pagination } from "@/components/shared/Pagination";
import { CustomerDrawer } from "@/components/customers/CustomerDrawer";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Button } from "@/components/ui/button";
import { formatInrCompact } from "@/lib/formatters";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, TrendingDown, UserX, Users } from "lucide-react";
import type { ChurnTier, CustomerListItem, LapsedCustomer } from "@/types/api";

const sz = "h-5 w-5";

const PAGE_SIZE = 50;

const TIER_CONFIG: Record<ChurnTier, { label: string; badgeCls: string }> = {
  "active":  { label: "Active",   badgeCls: "bg-green-100 text-green-800 border border-green-300" },
  "at-risk": { label: "At Risk",  badgeCls: "bg-amber-100 text-amber-800 border border-amber-300" },
  "lapsed":  { label: "Lapsed",   badgeCls: "bg-orange-100 text-orange-800 border border-orange-300" },
  "lost":    { label: "Lost",     badgeCls: "bg-red-100 text-red-800 border border-red-300" },
};

function toDrawerCustomer(c: LapsedCustomer): CustomerListItem {
  return {
    mobile_clean: c.mobile_clean,
    display_name: c.display_name,
    is_walk_in: false,
    is_member: c.is_member,
    is_repeat: true,
    first_seen_date: null,
    last_seen_date: c.last_purchase_date,
    total_bills: c.total_bills,
    total_revenue: c.total_revenue,
    avg_bill_value: c.avg_bill_value,
    total_discount_received: null,
    days_since_last_visit: c.days_since_last_visit,
    avg_days_between_visits: c.avg_days_between_visits,
    preferred_payment: c.preferred_payment,
  };
}

export default function LapsedCustomersPage() {
  const [activeTier, setActiveTier] = useState<ChurnTier | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CustomerListItem | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  const fetcher = useCallback(
    () => api.lapsedCustomers({ tier: activeTier, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [activeTier, page],
  );

  const { data, loading, error } = useFetch(fetcher, [activeTier, page]);

  const summary = data?.summary;
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const handleTierChange = (tier: ChurnTier | undefined) => {
    setActiveTier(tier);
    setPage(0);
  };

  const handleExport = async (fmt: "csv" | "xlsx") => {
    setExporting(fmt);
    try {
      await api.downloadLapsedExport(fmt, activeTier);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customer Activity</h1>
          <p className="text-gray-600 mt-1">
            Repeat customers by visit recency
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={exporting !== null}
            onClick={() => handleExport("csv")}
          >
            {exporting === "csv" ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exporting !== null}
            onClick={() => handleExport("xlsx")}
          >
            {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
          </Button>
        </div>
      </div>

      {/* Summary KPIs — always full breakdown, not filtered */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard title="Active (0–29d)"   value={summary.active_count.toLocaleString("en-IN")}  accent="green"  icon={<CheckCircle2 className={sz} />} />
          <KpiCard title="At Risk (30–59d)" value={summary.at_risk_count.toLocaleString("en-IN")} accent="yellow" icon={<AlertTriangle className={sz} />} />
          <KpiCard title="Lapsed (60–89d)"  value={summary.lapsed_count.toLocaleString("en-IN")}  accent="yellow" icon={<TrendingDown className={sz} />} />
          <KpiCard title="Lost (90d+)"      value={summary.lost_count.toLocaleString("en-IN")}    accent="red"    icon={<UserX className={sz} />} />
          <KpiCard title="Total Repeat"     value={summary.total_count.toLocaleString("en-IN")}   accent="blue"   icon={<Users className={sz} />} />
        </div>
      )}

      {/* Tier filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          variant={activeTier === undefined ? "default" : "outline"}
          onClick={() => handleTierChange(undefined)}
        >
          All {summary && <span className="ml-1.5 text-xs opacity-70">{summary.total_count}</span>}
        </Button>
        {(["active", "at-risk", "lapsed", "lost"] as ChurnTier[]).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={activeTier === t ? "default" : "outline"}
            onClick={() => handleTierChange(t)}
          >
            {TIER_CONFIG[t].label}
            {summary && (
              <span className="ml-1.5 text-xs opacity-70">
                {t === "active" ? summary.active_count : t === "at-risk" ? summary.at_risk_count : t === "lapsed" ? summary.lapsed_count : summary.lost_count}
              </span>
            )}
          </Button>
        ))}
        {data && (
          <span className="text-sm text-gray-500 ml-auto">
            {data.total.toLocaleString("en-IN")} customers
          </span>
        )}
      </div>

      {/* Table */}
      <DataStateWrapper
        loading={loading}
        error={error}
        empty={!data || data.items.length === 0}
        skeletonRows={8}
      >
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Mobile</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Days Silent</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Last Visit</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total Spend</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Visits</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Avg Bill</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.items.map((c) => (
                  <tr
                    key={c.mobile_clean}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setSelected(toDrawerCustomer(c))}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{c.display_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.mobile_clean}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TIER_CONFIG[c.churn_tier].badgeCls}`}>
                        {TIER_CONFIG[c.churn_tier].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {c.days_since_last_visit ?? "—"}d
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.last_purchase_date ? format(new Date(c.last_purchase_date), "d MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {c.total_revenue != null ? formatInrCompact(c.total_revenue) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{c.total_bills ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {c.avg_bill_value != null ? formatInrCompact(c.avg_bill_value) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.is_member && (
                        <span className="inline-block rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-medium">
                          Member
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataStateWrapper>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <Pagination
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          total={data.total}
          pageSize={PAGE_SIZE}
        />
      )}

      {/* History drawer */}
      <CustomerDrawer customer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
