"use client";

import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { DemandTrendChart } from "./DemandTrendChart";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

interface ProductDrawerProps {
  barcode: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductDrawer({
  barcode,
  productName,
  open,
  onOpenChange,
}: ProductDrawerProps) {
  const trend = useFetch(
    () => api.demandTrend(barcode, 60),
    [barcode, open]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{productName}</SheetTitle>
          <p className="text-sm text-gray-600 mt-1">Barcode: {barcode}</p>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Demand Trend (60 days)
            </h3>
            <DataStateWrapper
              loading={trend.loading}
              error={trend.error}
              empty={!trend.data || trend.data.length === 0}
              skeletonRows={2}
            >
              {trend.data && <DemandTrendChart data={trend.data} />}
            </DataStateWrapper>
          </div>

          {/* Summary stats from latest data point */}
          {trend.data && trend.data.length > 0 && (
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
              <div>
                <p className="text-sm text-gray-600">Latest Qty Sold</p>
                <p className="text-xl font-semibold text-gray-900">
                  {Math.round(trend.data[trend.data.length - 1].quantity_sold * 10) / 10}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Latest Revenue</p>
                <p className="text-xl font-semibold text-gray-900">
                  ₹{Math.round(trend.data[trend.data.length - 1].revenue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">7d Avg</p>
                <p className="text-lg font-semibold text-gray-900">
                  {trend.data[trend.data.length - 1].last_7_day_avg == null
                    ? "—"
                    : Math.round(
                        trend.data[trend.data.length - 1].last_7_day_avg! * 10
                      ) / 10}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Predicted Demand</p>
                <p className="text-lg font-semibold text-gray-900">
                  {trend.data[trend.data.length - 1].predicted_daily_demand == null
                    ? "—"
                    : Math.round(
                        trend.data[trend.data.length - 1].predicted_daily_demand! * 10
                      ) / 10}
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
