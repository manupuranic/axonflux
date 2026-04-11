"use client";

import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Package } from "lucide-react";

interface DataStateWrapperProps {
  loading: boolean;
  error: string | null;
  empty: boolean;
  skeletonRows?: number;
  children: ReactNode;
}

export function DataStateWrapper({
  loading,
  error,
  empty,
  skeletonRows = 5,
  children,
}: DataStateWrapperProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 flex items-center space-x-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-medium">Error loading data</p>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <Package className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-gray-600">No data available</p>
      </div>
    );
  }

  return <>{children}</>;
}
