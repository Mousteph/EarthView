"use client";
import { useEffect, useState } from "react";
import { isEventEnrichment, isOverlayFeed, type EventEnrichment, type OverlayFeed } from "./enrichment";
import { startEnrichmentPolling } from "./enrichmentPolling";

function useEnrichment<T>(url: string | null, revision: string, validate: (value: unknown) => value is T) {
  const [state, setState] = useState<{ url: string | null; data: T | null; loading: boolean; error: string | null; stale: boolean }>({ url: null, data: null, loading: false, error: null, stale: false });
  const resourceKey = url?.includes("/details?") ? url.split("?")[0] : url;
  useEffect(() => {
    if (!url) return;
    return startEnrichmentPolling(url, validate, {
      loading: () => setState((current) => ({ url: resourceKey, data: current.url === resourceKey ? current.data : null, loading: true, error: null, stale: current.url === resourceKey && current.data !== null })),
      success: (payload) => setState({ url: resourceKey, data: payload, loading: false, error: null, stale: false }),
      failure: (error) => setState((current) => ({ ...current, loading: false, error, stale: current.data !== null })),
    });
  }, [url, resourceKey, revision, validate]);
  return { data: url && state.url === resourceKey ? state.data : null, loading: !!url && (state.url !== resourceKey || state.loading), error: state.url === resourceKey ? state.error : null, stale: state.url === resourceKey && state.stale };
}
export function useSevereEventOverlays(url: string | null, revision: string) { return useEnrichment<OverlayFeed>(url, revision, isOverlayFeed); }
export function useSevereEventDetails(url: string | null) { return useEnrichment<EventEnrichment>(url, "", isEventEnrichment); }
