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

export function PaymentBreakdownChart({ data }: PaymentBreakdownChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods Breakdown</CardTitle>
        <CardDescription>Daily payment method distribution (last 90 days)</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
