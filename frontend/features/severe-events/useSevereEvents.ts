"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSevereEvent, type SevereEvent } from "./model";
import { SEVERE_EVENT_REFRESH_INTERVAL_MS, shouldRefreshSevereEvents } from "./refreshPolicy";

export function useSevereEvents(visible: boolean) {
  const [events, setEvents] = useState<readonly SevereEvent[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const requestId = useRef(0);
  const lastRequestAt = useRef(0);

  const refresh = useCallback(async (): Promise<readonly SevereEvent[] | null> => {
    const currentRequest = ++requestId.current;
    lastRequestAt.current = Date.now();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/severe-events", { cache: "no-store" });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const detail = failure && typeof failure === "object" && "detail" in failure ? failure.detail : null;
        throw new Error(typeof detail === "string" ? detail : "Unable to load severe-event data");
      }
      const payload: unknown = await response.json();
      if (!Array.isArray(payload) || !payload.every(isSevereEvent)) throw new Error("Severe-event data has an invalid format");
      if (currentRequest !== requestId.current) return null;
      setEvents(payload);
      setHasLoaded(true);
      setStale(false);
      return payload;
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load severe-event data");
        setStale(hasLoaded);
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [hasLoaded]);

  useEffect(() => {
    if (!visible) return;
    if (shouldRefreshSevereEvents(hasLoaded, lastRequestAt.current, Date.now())) void refresh();
    const interval = window.setInterval(() => void refresh(), SEVERE_EVENT_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      requestId.current += 1;
    };
  }, [hasLoaded, refresh, visible]);

  return { events, hasLoaded, isLoading, error, stale, refresh };
}
