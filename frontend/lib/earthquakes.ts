"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Earthquake = {
  readonly id: string;
  readonly place: string;
  readonly lat: number;
  readonly lon: number;
  readonly magnitude: number;
  readonly location: string;
  readonly time: number;
  readonly depth: number;
};

function isEarthquake(value: unknown): value is Earthquake {
  if (!value || typeof value !== "object") return false;

  const earthquake = value as Record<string, unknown>;
  return typeof earthquake.id === "string"
    && typeof earthquake.place === "string"
    && typeof earthquake.lat === "number"
    && typeof earthquake.lon === "number"
    && typeof earthquake.magnitude === "number"
    && typeof earthquake.location === "string"
    && typeof earthquake.time === "number"
    && typeof earthquake.depth === "number";
}

export function useEarthquakes() {
  const [earthquakes, setEarthquakes] = useState<readonly Earthquake[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async (): Promise<readonly Earthquake[] | null> => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/earthquakes", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load earthquake data");

      const payload: unknown = await response.json();
      if (!Array.isArray(payload) || !payload.every(isEarthquake)) {
        throw new Error("Earthquake data has an invalid format");
      }

      if (currentRequest !== requestId.current) return null;

      setEarthquakes(payload);
      setHasLoaded(true);
      return payload;
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load earthquake data");
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    });

    return () => window.clearTimeout(timer);
  }, [refresh]);

  return { earthquakes, hasLoaded, isLoading, error, refresh };
}
