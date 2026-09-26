"use client";

import { useMemo } from "react";
import { useEarthquakes } from "@/features/earthquakes/useEarthquakes";
import { useFires } from "@/features/fires/useFires";
import { composeOrbitalObjects, useOrbitalFeeds } from "@/features/orbital/useOrbitalFeeds";
import type { OrbitalMode } from "@/features/orbital/model";
import {
  orbitalFilterMask,
  orbitalFilterOptions,
  orbitalVisibilityMask,
  visibleOrbitalCount,
  type OrbitalFilters,
} from "@/features/orbital/filters";

export function useMapLayers(enabledOrbitalModes: readonly OrbitalMode[], orbitalFilters: OrbitalFilters) {
  const earthquakeFeed = useEarthquakes();
  const fireFeed = useFires();
  const orbitalFeeds = useOrbitalFeeds(enabledOrbitalModes);
  const { active: satellitesFeed, debris: debrisFeed, rocketBodies: rocketBodiesFeed } = orbitalFeeds;
  const earthquakes = earthquakeFeed.earthquakes;
  const fires = fireFeed.fires;
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
    orbitalFeeds,
    earthquakes,
    fires,
    satelliteCatalog,
    orbitalObjects,
    filterOptions,
    visibleMask,
    orbitalSummaryItems,
    refreshSatellites: orbitalFeeds.refreshEnabled,
  };
}
