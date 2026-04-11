"use client";

import { Badge } from "@/components/ui/badge";
import { formatInrCompact } from "@/lib/formatters";
import type { CustomerListItem } from "@/types/api";
import { format } from "date-fns";

interface CustomerTableProps {
  items: CustomerListItem[];
  onRowClick: (customer: CustomerListItem) => void;
}

const paymentColor: Record<string, string> = {
  cash: "bg-green-100 text-green-800",
  card: "bg-blue-100 text-blue-800",
  upi: "bg-amber-100 text-amber-800",
  credit: "bg-red-100 text-red-800",
};

export function CustomerTable({ items, onRowClick }: CustomerTableProps) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 text-sm">
        No customers found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Mobile</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Visits</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Total Spend</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Avg Bill</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Last Visit</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Pays With</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Tags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {items.map((c) => (
            <tr
              key={c.mobile_clean}
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => onRowClick(c)}
            >
              <td className="px-4 py-3 font-medium text-gray-900">
                {c.display_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                {c.is_walk_in ? "—" : c.mobile_clean}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                {c.total_bills ?? "—"}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">
                {c.total_revenue != null ? formatInrCompact(c.total_revenue) : "—"}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                {c.avg_bill_value != null ? formatInrCompact(c.avg_bill_value) : "—"}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {c.last_seen_date
                  ? format(new Date(c.last_seen_date), "d MMM yyyy")
                  : "—"}
              </td>
              <td className="px-4 py-3">
                {c.preferred_payment ? (
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      paymentColor[c.preferred_payment] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {c.preferred_payment.toUpperCase()}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {c.is_member && (
                    <Badge variant="secondary" className="text-xs">Member</Badge>
                  )}
                  {c.is_repeat && (
                    <Badge variant="outline" className="text-xs">Repeat</Badge>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
