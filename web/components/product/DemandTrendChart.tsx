"use client";

import type { DemandTrendPoint } from "@/types/api";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";

interface DemandTrendChartProps {
  data: DemandTrendPoint[];
}

export function DemandTrendChart({ data }: DemandTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
      >
        <defs>
          <linearGradient id="qty-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => format(new Date(v), "d MMM")}
          tick={{ fontSize: 11 }}
        />
        <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
        <Tooltip
          labelFormatter={(v) => format(new Date(v as string), "d MMM yyyy")}
          formatter={(value) => {
            if (typeof value !== "number" || value === null) return "—";
            return Math.round(value * 10) / 10;
          }}
        />
        <Area
          type="monotone"
          dataKey="quantity_sold"
          fill="url(#qty-fill)"
          stroke="#3b82f6"
          strokeWidth={1.5}
          name="Qty Sold"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="last_7_day_avg"
          stroke="#f59e0b"
          strokeWidth={1.5}
          dot={false}
          name="7d Avg"
        />
        <Line
          type="monotone"
          dataKey="last_30_day_avg"
          stroke="#8b5cf6"
          strokeWidth={1.5}
          dot={false}
          name="30d Avg"
        />
        <Line
          type="monotone"
          dataKey="predicted_daily_demand"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          strokeDasharray="4 2"
          name="Predicted"
        />
        <Legend wrapperStyle={{ paddingTop: "10px" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
