"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPayload, reuseSatelliteCatalog, type OrbitalMode, type Satellite, type SatellitesResponse } from "./model";
import { recordSatelliteFeedTiming } from "./performance";

const REFRESH_INTERVAL = 2 * 60 * 60 * 1000 + 5 * 60 * 1000;
const EMPTY_SATELLITES: readonly Satellite[] = Object.freeze([]);

export function useSatellites(visible: boolean, mode: OrbitalMode = "active") {
  const [feeds, setFeeds] = useState<Partial<Record<OrbitalMode, SatellitesResponse>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const lastRequestAt = useRef<Record<OrbitalMode, number>>({ active: 0, debris: 0, rocket_bodies: 0 });
  const data = feeds[mode] ?? null;

  const refresh = useCallback(async (): Promise<SatellitesResponse | null> => {
    const currentRequest = ++requestId.current;
    lastRequestAt.current[mode] = Date.now();
    const requestStartedAt = performance.now();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/satellites?mode=${mode}`, { cache: "no-store" });
      recordSatelliteFeedTiming(mode, "request", performance.now() - requestStartedAt);
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const detail = failure && typeof failure === "object" && "detail" in failure ? failure.detail : null;
        throw new Error(typeof detail === "string" ? detail : "Unable to load satellite data");
      }
      const bodyStartedAt = performance.now();
      const payload: unknown = await response.json();
      recordSatelliteFeedTiming(mode, "bodyAndJson", performance.now() - bodyStartedAt);
      const validationStartedAt = performance.now();
      const validPayload = isPayload(payload, mode);
      recordSatelliteFeedTiming(mode, "validation", performance.now() - validationStartedAt);
      if (!validPayload) throw new Error("Satellite data has an invalid format");
      if (currentRequest === requestId.current) setFeeds((current) => ({
        ...current,
        [mode]: reuseSatelliteCatalog(current[mode], payload),
      }));
      return payload;
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load satellite data");
        setFeeds((current) => current[mode] ? { ...current, [mode]: { ...current[mode], stale: true } } : current);
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!visible) return;
    const initialLoad = !data || Date.now() - lastRequestAt.current[mode] >= REFRESH_INTERVAL
      ? window.setTimeout(() => void refresh())
      : undefined;
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL);
    return () => {
      if (initialLoad !== undefined) window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      requestId.current += 1;
    };
  }, [data, mode, refresh, visible]);

  return { satellites: data?.satellites ?? EMPTY_SATELLITES, hasLoaded: data !== null, isLoading, error, stale: Boolean(data?.stale || data?.metadataStale), refresh };
}
