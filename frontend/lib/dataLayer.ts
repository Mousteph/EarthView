"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoEvent = {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly time: number;
};

export function useDataLayer<T extends GeoEvent>(
  endpoint: string,
  label: string,
  isEntity: (value: unknown) => value is T,
  autoLoad = true,
) {
  const [entities, setEntities] = useState<readonly T[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async (): Promise<readonly T[] | null> => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const detail = failure && typeof failure === "object" && "detail" in failure
          ? failure.detail
          : null;
        throw new Error(typeof detail === "string" ? detail : `Unable to load ${label} data`);
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload) || !payload.every(isEntity)) {
        throw new Error(`${label} data has an invalid format`);
      }
      if (currentRequest !== requestId.current) return null;

      setEntities(payload);
      setHasLoaded(true);
      return payload;
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : `Unable to load ${label} data`);
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [endpoint, isEntity, label]);

  useEffect(() => {
    if (!autoLoad) return;
    const timer = window.setTimeout(() => void refresh());
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [autoLoad, refresh]);

  return { entities, hasLoaded, isLoading, error, refresh };
}
