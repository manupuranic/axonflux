"use client";

import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { SummaryGrid } from "@/components/dashboard/SummaryGrid";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PaymentBreakdownChart } from "@/components/dashboard/PaymentBreakdownChart";
import { PurchaseChart } from "@/components/dashboard/PurchaseChart";

export default function DashboardPage() {
  const summary = useFetch(() => api.summary());
  const revenue = useFetch(() => api.dailyRevenue());
  const payments = useFetch(() => api.dailyPayments());
  const purchases = useFetch(() => api.dailyPurchases());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your inventory, sales, and purchases</p>
      </div>

      {/* KPI Summary */}
      <DataStateWrapper
        loading={summary.loading}
        error={summary.error}
        empty={!summary.data}
        skeletonRows={2}
      >
        {summary.data && <SummaryGrid data={summary.data} />}
      </DataStateWrapper>

      {/* Revenue Chart */}
      <DataStateWrapper
        loading={revenue.loading}
        error={revenue.error}
        empty={!revenue.data || revenue.data.length === 0}
      >
        {revenue.data && <RevenueChart data={revenue.data} />}
      </DataStateWrapper>

      {/* Purchase Chart */}
      <DataStateWrapper
        loading={purchases.loading}
        error={purchases.error}
        empty={!purchases.data || purchases.data.length === 0}
      >
        {purchases.data && <PurchaseChart data={purchases.data} />}
      </DataStateWrapper>

      {/* Payment Breakdown Chart */}
      <DataStateWrapper
        loading={payments.loading}
        error={payments.error}
        empty={!payments.data || payments.data.length === 0}
      >
        {payments.data && <PaymentBreakdownChart data={payments.data} />}
      </DataStateWrapper>
    </div>
  );
}
