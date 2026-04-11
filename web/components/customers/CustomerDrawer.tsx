"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { formatInrCompact } from "@/lib/formatters";
import type { CustomerBill, CustomerListItem } from "@/types/api";
import { format } from "date-fns";

interface CustomerDrawerProps {
  customer: CustomerListItem | null;
  onClose: () => void;
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export function CustomerDrawer({ customer, onClose }: CustomerDrawerProps) {
  const [history, setHistory] = useState<CustomerBill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer || customer.is_walk_in) {
      setHistory([]);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .customerHistory(customer.mobile_clean)
      .then(setHistory)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [customer]);

  const inr = (v: number | null | undefined) =>
    v != null
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(v)
      : "—";

  return (
    <Sheet open={!!customer} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {customer && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>{customer.display_name ?? "Customer"}</SheetTitle>
              <SheetDescription>
                {customer.is_walk_in
                  ? "Walk-in / Retail aggregated"
                  : customer.mobile_clean}
              </SheetDescription>
            </SheetHeader>

            {/* Body — needs its own horizontal padding since SheetContent has none */}
            <div className="px-4 pb-6">
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <StatBlock
                  label="Total Spend"
                  value={customer.total_revenue != null ? formatInrCompact(customer.total_revenue) : "—"}
                />
                <StatBlock
                  label="Visits"
                  value={customer.total_bills ?? "—"}
                />
                <StatBlock
                  label="Avg Bill"
                  value={customer.avg_bill_value != null ? formatInrCompact(customer.avg_bill_value) : "—"}
                />
                <StatBlock
                  label="Days Since Visit"
                  value={customer.days_since_last_visit != null ? `${customer.days_since_last_visit}d` : "—"}
                />
                {customer.avg_days_between_visits != null && (
                  <StatBlock
                    label="Avg Days Between Visits"
                    value={`${Math.round(customer.avg_days_between_visits)}d`}
                  />
                )}
                {customer.preferred_payment && (
                  <StatBlock
                    label="Preferred Payment"
                    value={customer.preferred_payment.toUpperCase()}
                  />
                )}
              </div>

              {/* Purchase history */}
              {!customer.is_walk_in && (
                <>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">
                    Purchase History
                  </h3>

                  {loading && (
                    <p className="text-sm text-gray-500">Loading history…</p>
                  )}
                  {error && (
                    <p className="text-sm text-red-500">Error: {error}</p>
                  )}
                  {!loading && !error && history.length === 0 && (
                    <p className="text-sm text-gray-500">No bills found.</p>
                  )}
                  {!loading && !error && history.length > 0 && (
                    <div className="space-y-2">
                      {history.map((bill, idx) => (
                        <div
                          key={bill.bill_no ?? idx}
                          className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="font-medium text-gray-900">
                                {bill.net_total != null ? inr(bill.net_total) : "—"}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {bill.bill_date
                                  ? format(new Date(bill.bill_date), "EEE, d MMM yyyy")
                                  : "—"}
                                {bill.bill_no ? ` · #${bill.bill_no}` : ""}
                              </p>
                            </div>
                            <div className="text-right text-xs text-gray-500 space-y-0.5 shrink-0">
                              {(bill.cash_total ?? 0) > 0 && (
                                <p>Cash {inr(bill.cash_total)}</p>
                              )}
                              {(bill.card_total ?? 0) > 0 && (
                                <p>Card {inr(bill.card_total)}</p>
                              )}
                              {(bill.upi_total ?? 0) > 0 && (
                                <p>UPI {inr(bill.upi_total)}</p>
                              )}
                              {(bill.credit_total ?? 0) > 0 && (
                                <p className="text-red-600">Credit {inr(bill.credit_total)}</p>
                              )}
                              {(bill.total_discount ?? 0) > 0 && (
                                <p className="text-green-600">Disc {inr(bill.total_discount)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
