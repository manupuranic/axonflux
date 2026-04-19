"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { HotoForm } from "@/components/cash-closure/HotoForm";
import { HotoHistory } from "@/components/cash-closure/HotoHistory";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { HotoResponse } from "@/types/api";

export default function CashClosurePage() {
  const today = new Date().toISOString().slice(0, 10);

  const [isAdmin, setIsAdmin] = useState(false);
  const [todayRecord, setTodayRecord] = useState<HotoResponse | null | undefined>(
    undefined
  );
  const [history, setHistory] = useState<HotoResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Track when the tab was last hidden so we only refresh if away > 30s
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const user = getUser();
    setIsAdmin(user?.role === "admin");
  }, []);

  const fetchToday = useCallback(() => {
    return api.hoto
      .getByDate(today)
      .then((rec) => {
        setTodayRecord(rec);
        return rec;
      })
      .catch(() => {
        setTodayRecord(null);
        return null;
      });
  }, [today]);

  // Initial load
  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    api.hoto
      .list(10, 0)
      .then((res) => setHistory(res.items))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Refresh data when staff switch back to this tab after being away > 30s.
  // HotoForm only resets its state if there are no local unsaved changes,
  // so a staff member mid-entry won't lose their work.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else {
        const awayMs = hiddenAtRef.current
          ? Date.now() - hiddenAtRef.current
          : Infinity;
        if (awayMs > 30_000) {
          fetchToday();
          loadHistory();
        }
        hiddenAtRef.current = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [fetchToday, loadHistory]);

  const handleSaved = useCallback(
    (record: HotoResponse) => {
      setTodayRecord(record);
      loadHistory();
    },
    [loadHistory]
  );

  const handleVerify = useCallback(
    async (id: string, status: "verified" | "rejected", notes: string) => {
      await api.hoto.verify(id, status, notes || undefined);
      fetchToday();
      loadHistory();
    },
    [fetchToday, loadHistory]
  );

  const isLoading = todayRecord === undefined;

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Daily HOTO</h1>
        <p className="text-sm text-gray-500 mt-1">
          Hand Over Take Over — end-of-day cash reconciliation
        </p>
      </div>

      {/* Today's form */}
      <div className="rounded-xl border bg-white p-3 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-700 mb-4 sm:mb-5">
          Today&apos;s HOTO —{" "}
          {new Date(today + "T00:00:00").toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <HotoForm
            initialData={todayRecord}
            isAdmin={isAdmin}
            onSaved={handleSaved}
            onVerify={todayRecord ? handleVerify : undefined}
          />
        )}
      </div>

      {/* History */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-700">
            Recent HOTO History
          </h2>
        </div>
        {historyLoading ? (
          <div className="p-6 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <HotoHistory
            items={history}
            isAdmin={isAdmin}
            onVerify={handleVerify}
          />
        )}
      </div>
    </div>
  );
}
