"use client";

import { useState } from "react";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { ReplenishmentTable } from "@/components/replenishment/ReplenishmentTable";
import { Pagination } from "@/components/shared/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Building2 } from "lucide-react";

export default function ReplenishmentPage() {
  const [supplierInput, setSupplierInput] = useState("");
  const debouncedSupplier = useDebounce(supplierInput, 300);
  const [urgentOnly, setUrgentOnly] = useState(false);

  const replenishment = usePaginatedFetch(
    api.replenishment,
    {
      supplier: debouncedSupplier || undefined,
      urgent_only: urgentOnly,
      limit: 100,
      offset: 0,
    },
    100
  );

  const isSearching = supplierInput !== debouncedSupplier;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Replenishment</h1>
        <p className="text-gray-600 mt-1">Products that need restocking, sorted by urgency</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1 relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Supplier
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search supplier..."
              value={supplierInput}
              onChange={(e) => {
                setSupplierInput(e.target.value);
                replenishment.setPage(0);
              }}
              className="pl-10 pr-10"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />
            )}
          </div>
        </div>

        <div>
          <Button
            variant={urgentOnly ? "default" : "outline"}
            onClick={() => {
              setUrgentOnly(!urgentOnly);
              replenishment.setPage(0);
            }}
          >
            {urgentOnly ? "🔴 Urgent Only (On)" : "⚪ Urgent Only (Off)"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataStateWrapper
        loading={replenishment.loading}
        error={replenishment.error}
        empty={!replenishment.data || replenishment.data.items.length === 0}
        skeletonRows={8}
      >
        {replenishment.data && (
          <>
            <ReplenishmentTable items={replenishment.data.items} />
            <Pagination
              page={replenishment.page}
              setPage={replenishment.setPage}
              totalPages={replenishment.totalPages}
              total={replenishment.data.total}
              pageSize={100}
            />
          </>
        )}
      </DataStateWrapper>
    </div>
  );
}
