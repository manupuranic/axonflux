"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PipelineRun } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface PipelineTriggerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PipelineTriggerModal({ isOpen, onClose }: PipelineTriggerModalProps) {
  const [latestRun, setLatestRun] = useState<PipelineRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load latest run on mount or when modal opens
  useEffect(() => {
    if (isOpen) {
      loadLatestRun();
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOpen]);

  // Poll while running
  useEffect(() => {
    if (latestRun?.status === "running" && isOpen) {
      const interval = setInterval(() => {
        loadLatestRun();
      }, 2000); // Poll every 2 seconds
      setPollInterval(interval);
      return () => clearInterval(interval);
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
  }, [latestRun?.status, isOpen]);

  const loadLatestRun = async () => {
    try {
      setIsLoading(true);
      const run = await api.pipelineLatestRun();
      setLatestRun(run);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrigger = async (withIngestion: boolean) => {
    try {
      setIsTriggering(true);
      setError(null);
      const result = await api.pipelineTrigger(withIngestion);
      // Refresh the latest run
      await new Promise((resolve) => setTimeout(resolve, 500));
      await loadLatestRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger pipeline");
    } finally {
      setIsTriggering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Pipeline Management</CardTitle>
          <CardDescription>View status and trigger data pipeline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Latest Run Status */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Last Run</h3>
            {isLoading && !latestRun ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading status...
              </div>
            ) : latestRun ? (
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {latestRun.status === "running" && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    )}
                    {latestRun.status === "success" && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {latestRun.status === "failed" && (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium capitalize">{latestRun.status}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(latestRun.triggered_at), "d MMM yyyy HH:mm:ss")}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                    {latestRun.pipeline_type === "weekly_full_with_ingestion"
                      ? "With Ingestion"
                      : "Rebuild Only"}
                  </span>
                </div>

                {latestRun.completed_at && (
                  <p className="text-xs text-gray-500">
                    Completed: {format(new Date(latestRun.completed_at), "d MMM yyyy HH:mm:ss")}
                  </p>
                )}

                {latestRun.log_output && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-600 mb-1">Log Output:</p>
                    <div className="bg-gray-900 text-gray-100 text-xs p-2 rounded font-mono max-h-32 overflow-y-auto">
                      <pre>{latestRun.log_output}</pre>
                    </div>
                  </div>
                )}

                {latestRun.error_message && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-red-600 mb-1">Error:</p>
                    <div className="bg-red-50 text-red-800 text-xs p-2 rounded border border-red-200">
                      <pre className="overflow-x-auto">{latestRun.error_message}</pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No pipeline runs yet</p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-800 text-sm p-3 rounded border border-red-200">
              {error}
            </div>
          )}

          {/* Trigger Buttons */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Run Pipeline</p>

            <Button
              onClick={() => handleTrigger(false)}
              disabled={isTriggering || latestRun?.status === "running"}
              className="w-full"
              variant="outline"
            >
              {isTriggering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Triggering...
                </>
              ) : (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Rebuild Derived Tables Only
                </>
              )}
            </Button>

            <Button
              onClick={() => handleTrigger(true)}
              disabled={isTriggering || latestRun?.status === "running"}
              className="w-full"
              variant="default"
            >
              {isTriggering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Triggering...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Run With Ingestion
                </>
              )}
            </Button>
          </div>

          {/* Close Button */}
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full"
          >
            Close
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
