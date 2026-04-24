"use client";

import { useState, useRef, useEffect } from "react";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";
import { useFetch } from "@/hooks/useFetch";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/lib/api";
import { DataStateWrapper } from "@/components/shared/DataStateWrapper";
import { HealthSignalTable } from "@/components/health/HealthSignalTable";
import { ProductDrawer } from "@/components/product/ProductDrawer";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Download, Loader2, Search, X } from "lucide-react";

type SignalFlag = "all" | "fast" | "slow" | "dead" | "spike";

function SupplierCombobox({
  suppliers,
  value,
  onChange,
}: {
  suppliers: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? suppliers.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : suppliers;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync query when value cleared externally
  useEffect(() => { if (!value) setQuery(""); }, [value]);

  const select = (s: string) => {
    onChange(s);
    setQuery(s);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setQuery("");
  };

  return (
    <div ref={ref} className="relative w-64">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Filter by supplier..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(""); }}
          onFocus={() => setOpen(true)}
          className="w-full h-9 pl-8 pr-7 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-white shadow-lg">
          {filtered.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); select(s); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${value === s ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HealthPage() {
  const [flag, setFlag] = useState<SignalFlag>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [drawer, setDrawer] = useState<{ barcode: string; name: string; suppliers: string | null; avgMonthly: number | null } | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState("");

  const health = usePaginatedFetch(
    api.healthSignals,
    { flag, search: debouncedSearch || undefined, limit: 50, offset: 0 },
    50
  );

  const suppliersData = useFetch(() => api.listSuppliers(), []);
  const supplierNames: string[] = suppliersData.data?.map((s: { supplier_name: string }) => s.supplier_name) ?? [];

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

      {/* Filter + Export row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Product search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search product name or barcode..."
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); health.setPage(0); }}
            className="pl-10 pr-10 w-72"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />
          )}
        </div>

        {/* Supplier autocomplete */}
        <SupplierCombobox
          suppliers={supplierNames}
          value={selectedSupplier}
          onChange={setSelectedSupplier}
        />

        {/* Export buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => api.downloadSupplierExport(selectedSupplier || undefined)}
        >
          <Download className="h-4 w-4 mr-2" />
          {selectedSupplier ? `Export: ${selectedSupplier.split(" ").slice(0, 2).join(" ")}` : "Supplier Report"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => api.downloadHealthExport()}>
          <Download className="h-4 w-4 mr-2" />
          Full Export
        </Button>
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
            <HealthSignalTable
              items={health.data.items}
              onViewTrend={(barcode, name, suppliers, avgMonthly) => setDrawer({ barcode, name, suppliers, avgMonthly })}
            />
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

      {drawer && (
        <ProductDrawer
          barcode={drawer.barcode}
          productName={drawer.name}
          suppliers={drawer.suppliers}
          avgMonthlyConsumption={drawer.avgMonthly}
          open={!!drawer}
          onOpenChange={(open) => { if (!open) setDrawer(null); }}
        />
      )}
    </div>
  );
}
