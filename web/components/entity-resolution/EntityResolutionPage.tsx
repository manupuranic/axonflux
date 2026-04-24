"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { SuggestionClusterCard } from "@/components/entity-resolution/SuggestionClusterCard";
import { AliasTable } from "@/components/entity-resolution/AliasTable";
import type { SuggestionCluster, AliasResponse } from "@/types/api";

export function EntityResolutionPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("suggestions");

  // Suggestions state
  const [clusters, setClusters] = useState<SuggestionCluster[]>([]);
  const [clustersLoading, setClustersLoading] = useState(true);
  const [clustersError, setClustersError] = useState<string | null>(null);
  const [recomputeLoading, setRecomputeLoading] = useState(false);
  const [rebuildRequired, setRebuildRequired] = useState(false);

  // Aliases state
  const [aliases, setAliases] = useState<AliasResponse[]>([]);
  const [aliasTotal, setAliasTotal] = useState(0);
  const [aliasOffset, setAliasOffset] = useState(0);
  const aliasLimit = 50;
  const [aliasesLoading, setAliasesLoading] = useState(false);

  useEffect(() => {
    const user = getUser();
    setIsAdmin(user?.role === "admin");
  }, []);

  const loadClusters = useCallback(async () => {
    setClustersLoading(true);
    setClustersError(null);
    try {
      const data = await api.entityResolution.suggestions({ status: "pending", limit: 200 });
      setClusters(data);
    } catch (err) {
      setClustersError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setClustersLoading(false);
    }
  }, []);

  const loadAliases = useCallback(async (offset = 0) => {
    setAliasesLoading(true);
    try {
      const data = await api.entityResolution.aliases({ limit: aliasLimit, offset });
      setAliases(data.items);
      setAliasTotal(data.total);
      setAliasOffset(offset);
    } catch {
      // Silent failure — aliases tab shows empty state
    } finally {
      setAliasesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClusters();
    loadAliases();
  }, [loadClusters, loadAliases]);

  async function handleConfirm(aliasBarcode: string, canonicalBarcode: string) {
    const res = await api.entityResolution.confirm({ alias_barcode: aliasBarcode, canonical_barcode: canonicalBarcode });
    if (res.pipeline_rebuild_required) {
      setRebuildRequired(true);
    }
    // Refresh aliases silently
    loadAliases(aliasOffset);
  }

  async function handleReject(suggestionId: string) {
    await api.entityResolution.reject({ suggestion_id: suggestionId });
  }

  async function handleRecompute() {
    setRecomputeLoading(true);
    try {
      await api.entityResolution.recompute();
      // Poll after 45s for new suggestions
      setTimeout(loadClusters, 45_000);
    } catch (err) {
      setClustersError(err instanceof Error ? err.message : "Recompute failed");
    } finally {
      setRecomputeLoading(false);
    }
  }

  async function handleDeleteAlias(aliasBarcode: string) {
    await api.entityResolution.deleteAlias(aliasBarcode);
    loadAliases(aliasOffset);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entity Resolution</h1>
        <p className="text-sm text-gray-500 mt-1">
          Merge duplicate barcodes so analytics consolidate correctly after the next pipeline rebuild.
        </p>
      </div>

      {/* Rebuild required banner */}
      {rebuildRequired && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Pipeline rebuild required</span> — confirmed aliases won&apos;t affect analytics until you run a full pipeline rebuild.
        </div>
      )}

      <Separator />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="suggestions">
            Suggestions
            {clusters.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5">
                {clusters.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="aliases">
            Confirmed Aliases
            {aliasTotal > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5">
                {aliasTotal}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* --- Suggestions tab --- */}
        <TabsContent value="suggestions" className="mt-4 space-y-3">
          {clustersError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {clustersError}
            </div>
          )}

          {clustersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-md border border-gray-200 bg-gray-50 animate-pulse" />
              ))}
            </div>
          ) : clusters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 border border-dashed border-gray-200 rounded-md">
              <p className="text-lg font-medium">No pending suggestions</p>
              <p className="text-sm mt-1">Click &quot;Refresh Suggestions&quot; to run the clustering analysis.</p>
              {isAdmin && (
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={handleRecompute}
                  disabled={recomputeLoading}
                >
                  {recomputeLoading ? "Launching…" : "Refresh Suggestions"}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {clusters.length} cluster{clusters.length !== 1 ? "s" : ""} — review and confirm or reject each alias
                </p>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRecompute}
                    disabled={recomputeLoading}
                  >
                    {recomputeLoading ? "Launching…" : "Refresh"}
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {clusters.map((cluster) => (
                  <SuggestionClusterCard
                    key={cluster.cluster_key}
                    cluster={cluster}
                    onConfirm={handleConfirm}
                    onReject={handleReject}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* --- Confirmed Aliases tab --- */}
        <TabsContent value="aliases" className="mt-4">
          {aliasesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded border border-gray-200 bg-gray-50 animate-pulse" />
              ))}
            </div>
          ) : (
            <AliasTable
              aliases={aliases}
              total={aliasTotal}
              offset={aliasOffset}
              limit={aliasLimit}
              isAdmin={isAdmin}
              onDelete={handleDeleteAlias}
              onPageChange={(newOffset) => loadAliases(newOffset)}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
