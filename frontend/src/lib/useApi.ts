"use client";

/**
 * Data-fetching hooks.
 *
 * Deliberately small — no cache, no query library. Each hook owns one request
 * and always exposes the same four things, so every view can render the same
 * loading / error / empty states without inventing its own convention.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError, api, type QueryValue } from "./api";

export interface QueryResult<T> {
  data: T | null;
  /** True only on the first load; a refetch keeps the previous data on screen. */
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface QueryState<T> {
  data: T | null;
  error: string | null;
  /**
   * The query key of the last settled response, or null before the first one.
   * `isLoading` is derived from this rather than set in the effect, which keeps
   * the effect free of synchronous setState.
   */
  settled: string | null;
}

/**
 * GET a path, refetching whenever `query` changes.
 *
 * `query` is compared by serialized value rather than identity, so callers can
 * pass a fresh object literal each render without causing a request loop.
 */
export function useQuery<T>(
  path: string | null,
  query?: Record<string, QueryValue>,
): QueryResult<T> {
  const key = JSON.stringify(query ?? {});
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    settled: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;

    const controller = new AbortController();
    let cancelled = false;

    // Parsed from the key rather than closed over, so the effect depends only
    // on serialized values and never reads a ref during render.
    api
      .get<T>(path, JSON.parse(key), controller.signal)
      .then((result) => {
        if (!cancelled) setState({ data: result, error: null, settled: key });
      })
      .catch((err) => {
        // An aborted request was superseded, not failed.
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        // A 401 already redirected to login; showing an error here would flash
        // a message on the way out.
        if (err instanceof ApiError && err.isUnauthorized) return;
        setState((prev) => ({
          // Keep whatever was on screen; the view decides what to show.
          data: prev.data,
          error: err instanceof Error ? err.message : "Something went wrong.",
          settled: key,
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, key, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return {
    data: state.data,
    // Only the very first load blanks the view; later loads keep the previous
    // rows visible so filtering does not flash an empty table.
    isLoading: path !== null && state.settled === null,
    error: state.error,
    refetch,
  };
}

/**
 * Wraps a write (create / update / delete) with pending and error state.
 *
 * Returns the error message rather than throwing, so callers decide between an
 * inline field error and a banner.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setIsPending(true);
      setError(null);
      setFieldErrors({});
      try {
        return await fn(...args);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
          if (err.fieldErrors.length) {
            setFieldErrors(
              Object.fromEntries(err.fieldErrors.map((e) => [e.field, e.message])),
            );
          }
        } else {
          setError("Something went wrong. Please try again.");
        }
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  return { run, isPending, error, fieldErrors, reset };
}

/** Delays a fast-changing value — used so typing in a search box does not fire a request per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
