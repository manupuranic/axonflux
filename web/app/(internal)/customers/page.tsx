"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { Pagination } from "@/components/shared/Pagination";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { CustomerDrawer } from "@/components/customers/CustomerDrawer";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatInrCompact } from "@/lib/formatters";
import type { CustomerListItem } from "@/types/api";

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const [selected, setSelected] = useState<CustomerListItem | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showWalkin, setShowWalkin] = useState(false);
  const [filterRepeat, setFilterRepeat] = useState<boolean | undefined>(undefined);
  const [filterMember, setFilterMember] = useState<boolean | undefined>(undefined);

  const debouncedSearch = useDebounce(searchInput, 300);

  const summaryFetch = useFetch(() => api.customerSummary());

  const customers = usePaginatedFetch(
    api.customers,
    {
      search: debouncedSearch || undefined,
      include_walkin: showWalkin || undefined,
      is_repeat: filterRepeat,
      is_member: filterMember,
      limit: PAGE_SIZE,
      offset: 0,
    },
    PAGE_SIZE
  );

  const summary = summaryFetch.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
        <p className="text-gray-600 mt-1">Identified customers derived from billing records</p>
      </div>

      {/* Summary KPIs */}
      <DataStateWrapper
        loading={summaryFetch.loading}
        error={summaryFetch.error}
        empty={!summary}
        skeletonRows={1}
      >
        {summary && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              title="Unique Customers"
              value={summary.total_unique_customers.toLocaleString("en-IN")}
              accent="blue"
              icon="👥"
            />
            <KpiCard
              title="Repeat Customers"
              value={`${summary.repeat_customer_count.toLocaleString("en-IN")} (${summary.repeat_customer_percent}%)`}
              accent="green"
              icon="🔄"
            />
            <KpiCard
              title="Avg Bill Value"
              value={summary.avg_bill_value != null ? formatInrCompact(summary.avg_bill_value) : "—"}
              accent="purple"
              icon="💰"
            />
            <KpiCard
              title="Members"
              value={summary.members_count.toLocaleString("en-IN")}
              accent="yellow"
              icon="🎫"
            />
            <KpiCard
              title="New (Last 30d)"
              value={summary.new_customers_last_30d.toLocaleString("en-IN")}
              accent="green"
              icon="✨"
            />
            <KpiCard
              title="Walk-in Revenue"
              value={summary.walk_in_revenue_percent != null ? `${summary.walk_in_revenue_percent}%` : "—"}
              accent="red"
              icon="🚶"
            />
          </div>
        )}
      </DataStateWrapper>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search name or mobile…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            customers.setPage(0);
          }}
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant={filterRepeat === true ? "default" : "outline"}
          onClick={() => {
            setFilterRepeat((v) => (v === true ? undefined : true));
            customers.setPage(0);
          }}
        >
          Repeat Only
        </Button>
        <Button
          size="sm"
          variant={filterMember === true ? "default" : "outline"}
          onClick={() => {
            setFilterMember((v) => (v === true ? undefined : true));
            customers.setPage(0);
          }}
        >
          Members Only
        </Button>
        <Button
          size="sm"
          variant={showWalkin ? "default" : "outline"}
          onClick={() => {
            setShowWalkin((v) => !v);
            customers.setPage(0);
          }}
        >
          Include Walk-ins
        </Button>
        {customers.data && (
          <span className="text-sm text-gray-500 ml-auto">
            {customers.data.total.toLocaleString("en-IN")} customers
          </span>
        )}
      </div>

      {/* Table */}
      <DataStateWrapper
        loading={customers.loading}
        error={customers.error}
        empty={!customers.data || customers.data.items.length === 0}
        skeletonRows={8}
      >
        {customers.data && (
          <CustomerTable items={customers.data.items} onRowClick={setSelected} />
        )}
      </DataStateWrapper>

      {/* Pagination */}
      {customers.data && customers.data.total > PAGE_SIZE && (
        <Pagination
          page={customers.page}
          setPage={customers.setPage}
          totalPages={customers.totalPages}
          total={customers.data.total}
          pageSize={PAGE_SIZE}
        />
      )}

      {/* Drawer */}
      <CustomerDrawer
        customer={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
