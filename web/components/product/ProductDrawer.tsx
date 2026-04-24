"use client";

import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { DemandTrendChart } from "./DemandTrendChart";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import type { ProductRecommendation } from "@/types/api";

interface ProductDrawerProps {
  barcode: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers?: string | null;
  avgMonthlyConsumption?: number | null;
}

export function ProductDrawer({ barcode, productName, open, onOpenChange, suppliers, avgMonthlyConsumption }: ProductDrawerProps) {
  const trend = useFetch(() => api.demandTrend(barcode, 60), [barcode, open]);
  const recs  = useFetch(() => api.productRecommendations(barcode, 6), [barcode, open]);

  const last = trend.data?.[trend.data.length - 1];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">

        {/* Header band */}
        <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-base font-semibold leading-tight">{productName}</SheetTitle>
            <p className="text-xs text-muted-foreground font-mono">{barcode}</p>
          </SheetHeader>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">

          {/* Stats row */}
          {last && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Avg Monthly (units)", value: avgMonthlyConsumption != null ? Math.round(avgMonthlyConsumption * 10) / 10 : "—" },
                { label: "Predicted Daily",     value: last.predicted_daily_demand == null ? "—" : Math.round(last.predicted_daily_demand * 10) / 10 },
                { label: "Qty Sold (latest)",   value: Math.round(last.quantity_sold * 10) / 10 },
                { label: "7-Day Avg",           value: last.last_7_day_avg == null ? "—" : Math.round(last.last_7_day_avg * 10) / 10 },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border bg-card px-4 py-3">
                  <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                  <p className="text-xl font-bold tracking-tight">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Suppliers */}
          {suppliers && (
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Procured From</p>
              <div className="flex flex-wrap gap-1.5">
                {suppliers.split(", ").map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Demand chart */}
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Demand Trend — 60 days
            </p>
            <DataStateWrapper
              loading={trend.loading}
              error={trend.error}
              empty={!trend.data || trend.data.length === 0}
              skeletonRows={2}
            >
              {trend.data && <DemandTrendChart data={trend.data} />}
            </DataStateWrapper>
          </div>

          {/* Frequently bought together */}
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Frequently Bought Together
            </p>

            {recs.loading && (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {!recs.loading && (!recs.data || recs.data.length === 0) && (
              <p className="text-sm text-muted-foreground py-2">No basket data yet.</p>
            )}

            {recs.data && recs.data.length > 0 && (
              <div className="space-y-2">
                {recs.data.map((r: ProductRecommendation) => (
                  <div
                    key={r.other_barcode}
                    className="flex items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <div className="shrink-0 w-8 h-8 rounded bg-muted flex items-center justify-center">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate leading-tight">{r.canonical_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.co_occurrences} bills · lift {Number(r.lift).toFixed(1)}×
                      </p>
                    </div>
                    {r.mrp != null && (
                      <Badge variant="secondary" className="shrink-0 text-xs font-semibold">
                        ₹{r.mrp}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
