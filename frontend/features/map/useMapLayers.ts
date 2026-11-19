"use client";

import { useMemo } from "react";
import { mergeEarthquakes, filterEarthquakes } from "@/features/earthquakes/merge";
import type { EarthquakeSource } from "@/features/earthquakes/model";
import { useEarthquakes } from "@/features/earthquakes/useEarthquakes";
import { useFires } from "@/features/fires/useFires";
import { useSevereEvents } from "@/features/severe-events/useSevereEvents";
import { filterSevereEvents, severeEventCategoryCounts } from "@/features/severe-events/filters";
import { SEVERE_EVENT_CATEGORIES } from "@/features/severe-events/categories";
import type { SevereEventCategoryCounts, SevereAlertFilters } from "@/features/severe-events/filters";
import { usePipelineFeeds } from "@/features/pipelines/usePipelineFeeds";
import type { PipelineFuel } from "@/features/pipelines/model";
import { filterPipelines, pipelineStatusOptions, type PipelineStatusFilters } from "@/features/pipelines/filters";
import { composeOrbitalObjects, useOrbitalFeeds } from "@/features/orbital/useOrbitalFeeds";
import type { OrbitalMode } from "@/features/orbital/model";
import {
  orbitalFilterMask,
  orbitalFilterOptions,
  orbitalVisibilityMask,
  visibleOrbitalCount,
  type OrbitalFilters,
} from "@/features/orbital/filters";

export function useMapLayers(enabledSevereEventCategories: readonly string[], enabledOrbitalModes: readonly OrbitalMode[], orbitalFilters: OrbitalFilters, enabledPipelineFuels: readonly PipelineFuel[], pipelineStatusFilters: PipelineStatusFilters, severeAlertFilters: SevereAlertFilters, earthquakeSourceFilters: readonly EarthquakeSource[]) {
  const earthquakeFeed = useEarthquakes(enabledSevereEventCategories.includes("earthquakes"));
  const fireFeed = useFires(enabledSevereEventCategories.includes("active-fires"));
  const severeEventFeed = useSevereEvents(enabledSevereEventCategories.some((c) => c !== "active-fires"));
  const orbitalFeeds = useOrbitalFeeds(enabledOrbitalModes);
  const pipelineFeeds = usePipelineFeeds(enabledPipelineFuels);
  const { active: satellitesFeed, debris: debrisFeed, rocketBodies: rocketBodiesFeed } = orbitalFeeds;
  const earthquakeCatalog = useMemo(() => mergeEarthquakes(earthquakeFeed.earthquakes, severeEventFeed.events, earthquakeFeed.checkedAt), [earthquakeFeed.earthquakes, severeEventFeed.events, earthquakeFeed.checkedAt]);
  const earthquakes = useMemo(() => filterEarthquakes(earthquakeCatalog, earthquakeSourceFilters, severeAlertFilters.earthquakes ?? []), [earthquakeCatalog, earthquakeSourceFilters, severeAlertFilters]);
  const fires = fireFeed.fires;
  const severeEvents = useMemo(() => filterSevereEvents(severeEventFeed.events.filter((event) => event.eventType !== "EQ"), enabledSevereEventCategories, severeAlertFilters), [enabledSevereEventCategories, severeEventFeed.events, severeAlertFilters]);
  const severeEventOptions = SEVERE_EVENT_CATEGORIES;
  const severeEventCounts: SevereEventCategoryCounts = useMemo(() => ({ ...severeEventCategoryCounts(severeEventFeed.events, severeAlertFilters), earthquakes: earthquakes.length, "active-fires": fires.length }), [severeEventFeed.events, severeAlertFilters, earthquakes.length, fires.length]);
  const pipelineCatalog = useMemo(
    () => enabledPipelineFuels.flatMap((fuel) => pipelineFeeds.feeds[fuel].feed?.pipelines ?? []),
    [enabledPipelineFuels, pipelineFeeds.feeds],
  );
  const pipelines = useMemo(() => filterPipelines(pipelineCatalog, pipelineStatusFilters), [pipelineCatalog, pipelineStatusFilters]);
  const pipelineFilters = useMemo(
    () => pipelineStatusOptions(Object.values(pipelineFeeds.feeds).flatMap((feed) => feed.feed?.pipelines ?? [])),
    [pipelineFeeds.feeds],
  );
  const pipelineCounts = useMemo(() => pipelines.reduce((counts, pipeline) => {
    counts[pipeline.fuel] += 1;
    return counts;
  }, { gas: 0, oil: 0 }), [pipelines]);
  const satelliteCatalog = satellitesFeed.satellites;

  const orbitalObjects = useMemo(() => composeOrbitalObjects(enabledOrbitalModes, {
    active: satellitesFeed.satellites,
    debris: debrisFeed.satellites,
    rocket_bodies: rocketBodiesFeed.satellites,
  }), [debrisFeed.satellites, enabledOrbitalModes, rocketBodiesFeed.satellites, satellitesFeed.satellites]);
  const filterOptions = useMemo(() => orbitalFilterOptions(satelliteCatalog), [satelliteCatalog]);
  const visibleMask = useMemo(
    () => orbitalVisibilityMask(orbitalObjects, satelliteCatalog, orbitalFilters),
    [orbitalFilters, orbitalObjects, satelliteCatalog],
  );
  const orbitalSummaryItems = useMemo(() => [
    {
      id: "active" as const,
      count: visibleOrbitalCount(orbitalFilterMask(satelliteCatalog, orbitalFilters)),
      hasLoaded: satellitesFeed.hasLoaded,
    },
    { id: "debris" as const, count: debrisFeed.satellites.length, hasLoaded: debrisFeed.hasLoaded },
    { id: "rocket_bodies" as const, count: rocketBodiesFeed.satellites.length, hasLoaded: rocketBodiesFeed.hasLoaded },
  ], [
    debrisFeed.hasLoaded,
    debrisFeed.satellites.length,
    orbitalFilters,
    rocketBodiesFeed.hasLoaded,
    rocketBodiesFeed.satellites.length,
    satelliteCatalog,
    satellitesFeed.hasLoaded,
  ]);

  return {
    earthquakeCatalog,
    earthquakeFeed,
    fireFeed,
    severeEventFeed,
    pipelineFeeds: pipelineFeeds.feeds,
    orbitalFeeds,
    earthquakes,
    fires,
    severeEvents,
    severeEventOptions,
    severeEventCounts,
    pipelines,
    pipelineCatalog,
    pipelineFilters,
    pipelineCounts,
    satelliteCatalog,
    orbitalObjects,
    filterOptions,
    visibleMask,
    orbitalSummaryItems,
    refreshSatellites: orbitalFeeds.refreshEnabled,
    refreshPipelines: pipelineFeeds.refreshEnabled,
  };
}
