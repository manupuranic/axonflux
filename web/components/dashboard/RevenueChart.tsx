"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyRevenue } from "@/types/api";
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

interface RevenueChartProps {
  data: DailyRevenue[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Revenue Trend</CardTitle>
        <CardDescription>Last 90 days of sales revenue and average bill value</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                if (typeof value !== "number" || value === null) return "—";
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
              dataKey="total_revenue"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="Total Revenue"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="avg_bill_value"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
              name="Avg Bill Value"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
