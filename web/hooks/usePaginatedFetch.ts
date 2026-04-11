"use client";

import { useState, useEffect } from "react";
import type { PaginatedResponse } from "@/types/api";

interface UsePaginatedFetchState<T> {
  data: PaginatedResponse<T> | null;
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
}

export function usePaginatedFetch<TItem, TParams>(
  fetcher: (params: TParams) => Promise<PaginatedResponse<TItem>>,
  params: TParams,
  pageSize: number = 50
): UsePaginatedFetchState<TItem> {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PaginatedResponse<TItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mergedParams = {
    ...params,
    limit: pageSize,
    offset: page * pageSize,
  } as TParams;

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetcher(mergedParams);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetch();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, JSON.stringify(params)]);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return { data, loading, error, page, setPage, totalPages };
}
