"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInrCompact, formatQty } from "@/lib/formatters";
import type { TopProduct } from "@/types/api";

interface TopProductsCardProps {
  data: TopProduct[];
  days?: number;
  sortBy?: "revenue" | "qty";
  onSortChange?: (sort: "revenue" | "qty") => void;
}

export function TopProductsCard({
  data,
  days = 30,
  sortBy = "revenue",
  onSortChange,
}: TopProductsCardProps) {
  const maxRevenue = data[0]?.total_revenue ?? 1;
  const maxQty = data[0]?.total_qty ?? 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            Top Products — Last {days} Days
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">By {sortBy === "revenue" ? "revenue" : "quantity sold"}</p>
        </div>
        {onSortChange && (
          <div className="flex rounded-md border border-gray-200 text-xs overflow-hidden">
            <button
              onClick={() => onSortChange("revenue")}
              className={`px-3 py-1.5 transition-colors ${
                sortBy === "revenue"
                  ? "bg-blue-600 text-white font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Revenue
            </button>
            <button
              onClick={() => onSortChange("qty")}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                sortBy === "qty"
                  ? "bg-blue-600 text-white font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Qty
            </button>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y divide-gray-50">
          {data.map((product) => {
            const barValue =
              sortBy === "revenue"
                ? (product.total_revenue / maxRevenue) * 100
                : (product.total_qty / maxQty) * 100;

            return (
              <div key={product.barcode} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <span className="w-5 text-xs font-mono text-gray-400 shrink-0 text-right">
                    {product.rank}
                  </span>

                  {/* Product name + bar */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {product.product_name ?? product.barcode}
                    </p>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-400 transition-all duration-500"
                        style={{ width: `${barValue}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatInrCompact(product.total_revenue)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatQty(product.total_qty)} units
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {data.length === 0 && (
            <p className="px-6 py-8 text-center text-sm text-gray-400">No data available</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
