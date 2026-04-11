"use client";

import { use } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { DemandTrendChart } from "./DemandTrendChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInr, formatQty } from "@/lib/formatters";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Zap } from "lucide-react";
import { format } from "date-fns";

export function ProductDetailContent({
  params,
}: {
  params: Promise<{ barcode: string }>;
}) {
  const router = useRouter();
  const { barcode } = use(params);

  const details = useFetch(() => api.productDetail(barcode), [barcode]);
  const trend = useFetch(() => api.demandTrend(barcode, 60), [barcode]);

  const product = details.data as Record<string, unknown> | undefined;

  const isLoading = details.loading || trend.loading;
  const hasError = details.error || trend.error;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {(product?.canonical_name as string) || barcode}
          </h1>
          <p className="text-gray-600 mt-1 font-mono text-sm">
            Barcode: {barcode}
          </p>
        </div>
      </div>

      <DataStateWrapper
        loading={isLoading}
        error={hasError ? (details.error || trend.error || "Error loading data") : null}
        empty={!product && !trend.data}
        skeletonRows={5}
      >
        <div className="space-y-6">
          {/* Product Identity Section */}
          {product && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Product Identity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Brand</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {(product.brand as string) || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Category</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {(product.category as string) || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Subcategory</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {(product.subcategory as string) || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Product Type</p>
                    <Badge variant="outline">{(product.product_type as string) || "retail"}</Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Size</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {(product.size as string) || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Colour</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {(product.colour as string) || "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pricing & Stock Section */}
          {product && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Pricing & Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm font-medium text-gray-600">MRP</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {product.mrp ? formatInr(Number(product.mrp)) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Purchase Price</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {product.purchase_price ? formatInr(Number(product.purchase_price)) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Current Stock</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {product.system_stock ? formatQty(Number(product.system_stock)) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">GST Rate</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {product.gst_rate_percent ? `${product.gst_rate_percent}%` : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Demand Trend Chart */}
          {trend.data && trend.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Demand Trend (60 days)</CardTitle>
                <CardDescription>
                  Historical sales quantity and predicted demand
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DemandTrendChart data={trend.data} />
              </CardContent>
            </Card>
          )}

          {/* Summary Stats */}
          {trend.data && trend.data.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Latest Qty Sold
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.round(trend.data[trend.data.length - 1].quantity_sold * 10) / 10}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Latest Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatInr(trend.data[trend.data.length - 1].revenue)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    7-Day Average
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {trend.data[trend.data.length - 1].last_7_day_avg == null
                      ? "—"
                      : Math.round(trend.data[trend.data.length - 1].last_7_day_avg! * 10) / 10}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Predicted Demand
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {trend.data[trend.data.length - 1].predicted_daily_demand == null
                      ? "—"
                      : Math.round(
                          trend.data[trend.data.length - 1].predicted_daily_demand! * 10
                        ) / 10}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Additional Info */}
          {product && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Unit of Measure</p>
                    <p className="text-gray-900">{(product.unit_of_measure as string) || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">HSN Code</p>
                    <p className="font-mono text-gray-900">{(product.hsn_code as string) || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Status</p>
                    <Badge variant={product.is_active ? "default" : "destructive"}>
                      {product.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Reviewed</p>
                    <Badge variant={product.is_reviewed ? "default" : "outline"}>
                      {product.is_reviewed ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Created</p>
                    <p className="text-sm text-gray-900">
                      {product.created_at
                        ? format(new Date(product.created_at as string), "d MMM yyyy")
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Updated</p>
                    <p className="text-sm text-gray-900">
                      {product.updated_at
                        ? format(new Date(product.updated_at as string), "d MMM yyyy")
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DataStateWrapper>
    </div>
  );
}
