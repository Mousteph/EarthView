"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineFeedState, PipelineFuel } from "./model";
import { EMPTY_PIPELINE_FEED_STATE, isPipelineFeed } from "./model";

const endpoints: Record<PipelineFuel, string> = {
  gas: "/api/pipelines/gas",
  oil: "/api/pipelines/oil",
};

type FeedStates = Record<PipelineFuel, PipelineFeedState>;

export function usePipelineFeeds(enabledFuels: readonly PipelineFuel[]) {
  const [feeds, setFeeds] = useState<FeedStates>({ gas: EMPTY_PIPELINE_FEED_STATE, oil: EMPTY_PIPELINE_FEED_STATE });
  const requestIds = useRef<Record<PipelineFuel, number>>({ gas: 0, oil: 0 });
  const enabledRef = useRef(enabledFuels);
  enabledRef.current = enabledFuels;

  const refresh = useCallback(async (fuel: PipelineFuel): Promise<void> => {
    const requestId = ++requestIds.current[fuel];
    setFeeds((current) => ({ ...current, [fuel]: { ...current[fuel], isLoading: true, error: null } }));
    try {
      const response = await fetch(endpoints[fuel], { cache: "no-store" });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const detail = failure && typeof failure === "object" && "detail" in failure ? failure.detail : null;
        throw new Error(typeof detail === "string" ? detail : `Unable to load ${fuel} pipeline data`);
      }
      const payload: unknown = await response.json();
      if (!isPipelineFeed(payload, fuel)) throw new Error(`${fuel} pipeline data has an invalid format`);
      if (requestId !== requestIds.current[fuel]) return;
      setFeeds((current) => ({ ...current, [fuel]: { feed: payload, hasLoaded: true, isLoading: false, error: null } }));
    } catch (requestError) {
      if (requestId === requestIds.current[fuel]) {
        setFeeds((current) => ({
          ...current,
          [fuel]: {
            ...current[fuel],
            isLoading: false,
            error: requestError instanceof Error ? requestError.message : `Unable to load ${fuel} pipeline data`,
          },
        }));
      }
    }
  }, []);

  useEffect(() => {
    const timers = enabledFuels
      .filter((fuel) => !feeds[fuel].hasLoaded && !feeds[fuel].isLoading)
      .map((fuel) => window.setTimeout(() => void refresh(fuel)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [enabledFuels, feeds, refresh]);

  const refreshEnabled = useCallback(async () => {
    await Promise.all(enabledRef.current.map((fuel) => refresh(fuel)));
  }, [refresh]);

  return { feeds, refreshEnabled };
}
