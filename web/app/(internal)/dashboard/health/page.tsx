"use client";

import { useState } from "react";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { HealthSignalTable } from "@/components/health/HealthSignalTable";
import { Pagination } from "@/components/shared/Pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

type SignalFlag = "all" | "fast" | "slow" | "dead" | "spike";

export default function HealthPage() {
  const [flag, setFlag] = useState<SignalFlag>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const health = usePaginatedFetch(
    api.healthSignals,
    { flag, search: debouncedSearch || undefined, limit: 50, offset: 0 },
    50
  );

  const handleFlagChange = (newFlag: SignalFlag) => {
    setFlag(newFlag);
    health.setPage(0);
  };

  const isSearching = searchInput !== debouncedSearch;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Product Health</h1>
        <p className="text-gray-600 mt-1">Monitor fast-moving, slow-moving, and problematic stock</p>
      </div>

      {/* Tabs */}
      <Tabs value={flag} onValueChange={(v) => handleFlagChange(v as SignalFlag)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="fast">⚡ Fast Moving</TabsTrigger>
          <TabsTrigger value="slow">🐢 Slow Moving</TabsTrigger>
          <TabsTrigger value="dead">💀 Dead Stock</TabsTrigger>
          <TabsTrigger value="spike">📊 Demand Spike</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search with Loading Indicator */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by product name or barcode..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            health.setPage(0);
          }}
          className="pl-10 pr-10"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />
        )}
      </div>

      {/* Table */}
      <DataStateWrapper
        loading={health.loading}
        error={health.error}
        empty={!health.data || health.data.items.length === 0}
        skeletonRows={8}
      >
        {health.data && (
          <>
            <HealthSignalTable items={health.data.items} />
            <Pagination
              page={health.page}
              setPage={health.setPage}
              totalPages={health.totalPages}
              total={health.data.total}
              pageSize={50}
            />
          </>
        )}
      </DataStateWrapper>
    </div>
  );
}
