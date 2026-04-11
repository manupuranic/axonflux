"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyPayment } from "@/types/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { format } from "date-fns";

interface PaymentBreakdownChartProps {
  data: DailyPayment[];
}

const COLORS = {
  cash: "#10b981",
  card: "#3b82f6",
  upi: "#f59e0b",
  credit: "#ef4444",
};

/** Drop rows where any payment column is a clear outlier (> 100× the median).
 *  Catches opening-balance / journal entries that leak into billing exports. */
function filterOutliers(rows: DailyPayment[]): DailyPayment[] {
  if (rows.length < 2) return rows;

  const cashes = rows.map((r) => r.cash_total).sort((a, b) => a - b);
  const mid = Math.floor(cashes.length / 2);
  const median = cashes.length % 2 !== 0
    ? cashes[mid]
    : (cashes[mid - 1] + cashes[mid]) / 2;

  // If median is 0 (no cash days at all), fall back to a hard cap of ₹50L/day
  const threshold = median > 0 ? median * 100 : 5_000_000;

  return rows.filter(
    (r) =>
      r.cash_total   <= threshold &&
      r.card_total   <= threshold &&
      r.upi_total    <= threshold &&
      r.credit_total <= threshold
  );
}

export function PaymentBreakdownChart({ data }: PaymentBreakdownChartProps) {
  const clean = filterOutliers(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods Breakdown</CardTitle>
        <CardDescription>Daily payment method distribution (last 90 days)</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={clean} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="sale_date"
              tickFormatter={(v) => format(new Date(v), "d MMM")}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 12 }}
              width={60}
            />
            <Tooltip
              formatter={(value) => {
                if (typeof value !== "number") return "—";
                return new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(value);
              }}
              labelFormatter={(label) => format(new Date(label as string), "EEE, d MMM yyyy")}
            />
            <Legend />
            <Bar dataKey="cash_total" stackId="payment" name="Cash" fill={COLORS.cash} />
            <Bar dataKey="card_total" stackId="payment" name="Card" fill={COLORS.card} />
            <Bar dataKey="upi_total" stackId="payment" name="UPI" fill={COLORS.upi} />
            <Bar dataKey="credit_total" stackId="payment" name="Credit/Due" fill={COLORS.credit} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
