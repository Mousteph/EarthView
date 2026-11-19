import { SEVERE_EVENT_REFRESH_INTERVAL_MS } from "./refreshPolicy.ts";

/** Both overview and selection enrichment use the same abortable six-minute lifecycle. */
export function startEnrichmentPolling<T>(url: string, validate: (value: unknown) => value is T, callbacks: {
  readonly loading: () => void;
  readonly success: (value: T) => void;
  readonly failure: (message: string) => void;
}) {
  let active = true;
  let controller: AbortController | null = null;
  const load = async () => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    callbacks.loading();
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Additional GDACS data is temporarily unavailable");
      const payload: unknown = await response.json();
      if (!validate(payload)) throw new Error("Additional GDACS data has an invalid format");
      if (active && !signal.aborted) callbacks.success(payload);
    } catch (error) {
      if (active && !signal.aborted) callbacks.failure(error instanceof Error ? error.message : "Unable to load event details");
    }
  };
  void load();
  const interval = globalThis.setInterval(() => void load(), SEVERE_EVENT_REFRESH_INTERVAL_MS);
  return () => { active = false; controller?.abort(); globalThis.clearInterval(interval); };
}
