"use client";

import Link from "next/link";
import { formatQty } from "@/lib/formatters";
import type { ProductHealthSignal } from "@/types/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SignalBadge } from "./SignalBadge";
import { ExternalLink } from "lucide-react";

interface HealthSignalTableProps {
  items: ProductHealthSignal[];
  onViewTrend?: (barcode: string, name: string) => void;
}

export function HealthSignalTable({ items, onViewTrend }: HealthSignalTableProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-gray-700">Product</TableHead>
            <TableHead className="text-gray-700">Barcode</TableHead>
            <TableHead className="text-gray-700">Status</TableHead>
            <TableHead className="text-right text-gray-700">Pred. Demand</TableHead>
            <TableHead className="text-right text-gray-700">7d Avg</TableHead>
            <TableHead className="text-right text-gray-700">30d Avg</TableHead>
            <TableHead className="text-right text-gray-700">60d Avg</TableHead>
            <TableHead className="text-right text-gray-700">Volatility</TableHead>
            <TableHead className="text-center text-gray-700">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.product_id} className="hover:bg-gray-50">
              <TableCell className="font-medium text-gray-900">
                {item.product_name || "—"}
              </TableCell>
              <TableCell className="text-gray-600 text-sm font-mono">
                {item.product_id}
              </TableCell>
              <TableCell>
                <SignalBadge
                  fast={item.fast_moving_flag}
                  slow={item.slow_moving_flag}
                  dead={item.dead_stock_flag}
                  spike={item.demand_spike_flag}
                />
              </TableCell>
              <TableCell className="text-right text-gray-900">
                {formatQty(item.predicted_daily_demand)}
              </TableCell>
              <TableCell className="text-right text-gray-600">
                {formatQty(item.last_7_day_avg)}
              </TableCell>
              <TableCell className="text-right text-gray-600">
                {formatQty(item.last_30_day_avg)}
              </TableCell>
              <TableCell className="text-right text-gray-600">
                {formatQty(item.last_60_day_avg)}
              </TableCell>
              <TableCell className="text-right text-gray-600">
                {item.demand_volatility == null
                  ? "—"
                  : `${(item.demand_volatility * 100).toFixed(0)}%`}
              </TableCell>
              <TableCell className="text-center">
                <Link href={`/products/${encodeURIComponent(item.product_id)}`}>
                  <Button variant="ghost" size="sm">
                    Details
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
