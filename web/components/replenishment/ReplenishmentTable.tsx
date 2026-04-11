"use client";

import Link from "next/link";
import { formatQty, formatDays } from "@/lib/formatters";
import type { ReplenishmentItem } from "@/types/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { UrgencyBadge } from "./UrgencyBadge";
import { ExternalLink } from "lucide-react";

interface ReplenishmentTableProps {
  items: ReplenishmentItem[];
  onViewTrend?: (barcode: string, name: string) => void;
}

export function ReplenishmentTable({ items, onViewTrend }: ReplenishmentTableProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="text-gray-700">Product</TableHead>
            <TableHead className="text-gray-700">Supplier</TableHead>
            <TableHead className="text-right text-gray-700">Stock</TableHead>
            <TableHead className="text-right text-gray-700">Daily Demand</TableHead>
            <TableHead className="text-right text-gray-700">Days of Cover</TableHead>
            <TableHead className="text-right text-gray-700">Lead Time</TableHead>
            <TableHead className="text-right text-gray-700">Required Qty</TableHead>
            <TableHead className="text-right text-gray-700">Min/Max Stock</TableHead>
            <TableHead className="text-center text-gray-700">Status</TableHead>
            <TableHead className="text-center text-gray-700">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.barcode}-${item.supplier_name}`} className="hover:bg-gray-50">
              <TableCell className="font-medium text-gray-900">
                {item.product_name || item.barcode}
              </TableCell>
              <TableCell className="text-gray-600">
                {item.supplier_name || "—"}
              </TableCell>
              <TableCell className="text-right text-gray-900">
                {formatQty(item.system_stock)}
              </TableCell>
              <TableCell className="text-right text-gray-600">
                {formatQty(item.predicted_daily_demand)}
              </TableCell>
              <TableCell className="text-right text-gray-900 font-semibold">
                {formatDays(item.days_of_cover)}
              </TableCell>
              <TableCell className="text-right text-gray-600">
                {formatDays(item.lead_time_days)}
              </TableCell>
              <TableCell className="text-right text-gray-900">
                {formatQty(item.required_quantity)}
              </TableCell>
              <TableCell className="text-right text-gray-600 text-sm">
                {item.min_stock && item.max_stock
                  ? `${Math.round(item.min_stock)} / ${Math.round(item.max_stock)}`
                  : "—"}
              </TableCell>
              <TableCell className="text-center">
                <UrgencyBadge
                  daysOfCover={item.days_of_cover}
                  leadTimeDays={item.lead_time_days}
                />
              </TableCell>
              <TableCell className="text-center">
                <Link href={`/products/${encodeURIComponent(item.barcode)}`}>
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
