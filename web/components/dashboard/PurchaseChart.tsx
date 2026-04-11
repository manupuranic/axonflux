"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyPurchase } from "@/types/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";

interface PurchaseChartProps {
  data: DailyPurchase[];
}

export function PurchaseChart({ data }: PurchaseChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Purchase Trend</CardTitle>
        <CardDescription>Last 90 days of purchase spend and average transaction value</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="purchase_date"
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
            <Line
              type="monotone"
              dataKey="total_taxable_value"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="Purchase Value"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
