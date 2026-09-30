"use client";

import { useMemo } from "react";
import { useEarthquakes } from "@/features/earthquakes/useEarthquakes";
import { useFires } from "@/features/fires/useFires";
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

export function useMapLayers(enabledOrbitalModes: readonly OrbitalMode[], orbitalFilters: OrbitalFilters, enabledPipelineFuels: readonly PipelineFuel[], pipelineStatusFilters: PipelineStatusFilters) {
  const earthquakeFeed = useEarthquakes();
  const fireFeed = useFires();
  const orbitalFeeds = useOrbitalFeeds(enabledOrbitalModes);
  const pipelineFeeds = usePipelineFeeds(enabledPipelineFuels);
  const { active: satellitesFeed, debris: debrisFeed, rocketBodies: rocketBodiesFeed } = orbitalFeeds;
  const earthquakes = earthquakeFeed.earthquakes;
  const fires = fireFeed.fires;
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
    earthquakeFeed,
    fireFeed,
    pipelineFeeds: pipelineFeeds.feeds,
    orbitalFeeds,
    earthquakes,
    fires,
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
