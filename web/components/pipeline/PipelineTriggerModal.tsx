"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { LastDataDate, PipelineRun } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Database,
  BarChart3,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface PipelineTriggerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "export" | "ingest" | "rebuild";

function detectStep(log: string): Step {
  if (log.includes("[STEP 3/3]")) return "rebuild";
  if (log.includes("[STEP 2/3]")) return "ingest";
  return "export";
}

function StepIndicator({
  label,
  icon: Icon,
  state,
}: {
  label: string;
  icon: React.ElementType;
  state: "pending" | "active" | "done" | "failed";
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          state === "done"
            ? "bg-green-100 text-green-700"
            : state === "active"
            ? "bg-blue-100 text-blue-700"
            : state === "failed"
            ? "bg-red-100 text-red-700"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {state === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "done" ? (
          <CheckCircle className="h-3.5 w-3.5" />
        ) : state === "failed" ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
      </div>
      <span
        className={`text-sm ${
          state === "active"
            ? "font-medium text-blue-700"
            : state === "done"
            ? "text-green-700"
            : state === "failed"
            ? "text-red-700"
            : "text-gray-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function PipelineTriggerModal({ isOpen, onClose }: PipelineTriggerModalProps) {
  const [lastDataInfo, setLastDataInfo] = useState<LastDataDate | null>(null);
  const [activeRun, setActiveRun] = useState<PipelineRun | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setActiveRun(null);
    // Load last data date for preflight info
    api.pipelineLastDataDate().then(setLastDataInfo).catch(() => {});
  }, [isOpen]);

  // Auto-scroll log to bottom when new content arrives
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [activeRun?.log_output]);

  // Poll specific run while it's running
  useEffect(() => {
    if (!activeRun || activeRun.status !== "running") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.pipelineRunById(activeRun.id);
        setActiveRun(updated);
        if (updated.status !== "running") clearInterval(pollRef.current!);
      } catch {}
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeRun?.id, activeRun?.status]);

  const triggerFullRefresh = async () => {
    setIsTriggering(true);
    setError(null);
    setActiveRun(null);
    setShowFullLog(false);
    try {
      const result = await api.pipelineFullRefresh();
      // Brief delay so the run record is committed
      await new Promise((r) => setTimeout(r, 600));
      const run = await api.pipelineRunById(result.run_id);
      setActiveRun(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start refresh");
    } finally {
      setIsTriggering(false);
    }
  };

  const triggerLegacy = async (withIngestion: boolean) => {
    setIsTriggering(true);
    setError(null);
    setActiveRun(null);
    setShowFullLog(false);
    try {
      const result = await api.pipelineTrigger(withIngestion);
      await new Promise((r) => setTimeout(r, 600));
      const run = await api.pipelineRunById(result.run_id);
      setActiveRun(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger pipeline");
    } finally {
      setIsTriggering(false);
    }
  };

  if (!isOpen) return null;

  const isRunning = activeRun?.status === "running";
  const log = activeRun?.log_output ?? "";
  const currentStep = isRunning ? detectStep(log) : null;

  const stepState = (step: Step): "pending" | "active" | "done" | "failed" => {
    if (!activeRun) return "pending";
    if (activeRun.status === "failed") {
      if (currentStep === step) return "failed";
      // steps before current are done, steps after are pending
    }
    const order: Step[] = ["export", "ingest", "rebuild"];
    const runningIdx = currentStep ? order.indexOf(currentStep) : -1;
    const stepIdx = order.indexOf(step);
    if (!isRunning && activeRun.status === "success") return "done";
    if (!isRunning && activeRun.status === "failed") {
      if (stepIdx < runningIdx) return "done";
      if (stepIdx === runningIdx) return "failed";
      return "pending";
    }
    if (stepIdx < runningIdx) return "done";
    if (stepIdx === runningIdx) return "active";
    return "pending";
  };

  const isFullRefreshRun = activeRun?.pipeline_type === "full_refresh";
  const logLines = log.split("\n");
  const visibleLog = showFullLog ? log : logLines.slice(-30).join("\n");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg max-h-[92vh] flex flex-col">
        <CardHeader className="shrink-0 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Refresh Data</CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {lastDataInfo && !activeRun && (
            <div className="mt-1 text-sm text-gray-500">
              {lastDataInfo.last_data_date ? (
                <>
                  Last data:{" "}
                  <span className="font-medium text-gray-700">
                    {format(parseISO(lastDataInfo.last_data_date), "d MMM yyyy")}
                  </span>
                  {lastDataInfo.days_behind != null && lastDataInfo.days_behind > 0 && (
                    <span className="ml-2 text-amber-600 font-medium">
                      ({lastDataInfo.days_behind} day{lastDataInfo.days_behind !== 1 ? "s" : ""} behind)
                    </span>
                  )}
                  {lastDataInfo.days_behind === 0 && (
                    <span className="ml-2 text-green-600 font-medium">(up to date)</span>
                  )}
                </>
              ) : (
                "No data ingested yet"
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto space-y-4">
          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-800 text-sm p-3 rounded border border-red-200">
              {error}
            </div>
          )}

          {/* Active run */}
          {activeRun ? (
            <div className="space-y-4">
              {/* Step indicators — only for full_refresh */}
              {isFullRefreshRun && (
                <div className="border rounded-lg p-3 space-y-2.5 bg-gray-50">
                  <StepIndicator
                    label="Export from Er4u"
                    icon={RefreshCw}
                    state={stepState("export")}
                  />
                  <StepIndicator
                    label="Ingest files"
                    icon={Database}
                    state={stepState("ingest")}
                  />
                  <StepIndicator
                    label="Rebuild derived tables"
                    icon={BarChart3}
                    state={stepState("rebuild")}
                  />
                </div>
              )}

              {/* Status badge */}
              <div className="flex items-center gap-2">
                {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {activeRun.status === "success" && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {activeRun.status === "failed" && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm font-medium capitalize">
                  {isRunning ? "Running..." : activeRun.status}
                </span>
                {activeRun.completed_at && (
                  <span className="text-xs text-gray-400 ml-auto">
                    {format(new Date(activeRun.completed_at), "HH:mm:ss")}
                  </span>
                )}
              </div>

              {/* Live log */}
              {log && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">
                      {isRunning ? "Live output" : "Log output"}
                    </span>
                    <button
                      className="text-xs text-blue-600 flex items-center gap-0.5 hover:underline"
                      onClick={() => setShowFullLog((v) => !v)}
                    >
                      {showFullLog ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> View full log
                        </>
                      )}
                    </button>
                  </div>
                  <pre
                    ref={logRef}
                    className={`bg-gray-950 text-gray-100 text-xs p-3 rounded font-mono overflow-y-auto whitespace-pre-wrap break-all transition-all ${
                      showFullLog ? "max-h-[40vh]" : "max-h-48"
                    }`}
                  >
                    {visibleLog || " "}
                    {isRunning && (
                      <span className="inline-block w-1.5 h-3 bg-gray-100 animate-pulse ml-0.5 align-middle" />
                    )}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            /* Pre-run: trigger buttons */
            <div className="space-y-3">
              <Button
                onClick={triggerFullRefresh}
                disabled={isTriggering}
                className="w-full"
                size="lg"
              >
                {isTriggering ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Full Refresh (Export + Ingest + Rebuild)
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-400">Advanced</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => triggerLegacy(true)}
                  disabled={isTriggering}
                  variant="outline"
                  size="sm"
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  Ingest + Rebuild
                </Button>
                <Button
                  onClick={() => triggerLegacy(false)}
                  disabled={isTriggering}
                  variant="outline"
                  size="sm"
                >
                  <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                  Rebuild Only
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        {/* Footer close button — always show when run is done */}
        {activeRun && !isRunning && (
          <div className="shrink-0 border-t p-4">
            <Button onClick={onClose} className="w-full" variant="outline">
              Close
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
