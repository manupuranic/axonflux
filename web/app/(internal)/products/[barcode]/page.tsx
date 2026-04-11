import { Suspense } from "react";
import { ProductDetailContent } from "@/components/product/ProductDetailContent";

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ barcode: string }>;
}) {
  return (
    <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
      <ProductDetailContent params={params} />
    </Suspense>
  );
}
