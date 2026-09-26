"use client";

import { useSatellites } from "./useSatellites";
import type { OrbitalMode, OrbitalObject, Satellite } from "./model";

export function composeOrbitalObjects(enabledModes: readonly OrbitalMode[], catalogs: Record<OrbitalMode, readonly Satellite[]>): OrbitalObject[] {
  const objects: OrbitalObject[] = [];
  const seenIds = new Set<string>();
  for (const mode of ["active", "debris", "rocket_bodies"] as const) {
    if (!enabledModes.includes(mode)) continue;
    for (const satellite of catalogs[mode]) {
      if (seenIds.has(satellite.id)) continue;
      seenIds.add(satellite.id);
      objects.push({ ...satellite, orbitalMode: mode });
    }
  }
  return objects;
}

export function useOrbitalFeeds(enabledModes: readonly OrbitalMode[]) {
  const active = useSatellites(enabledModes.includes("active"), "active");
  const debris = useSatellites(enabledModes.includes("debris"), "debris");
  const rocketBodies = useSatellites(enabledModes.includes("rocket_bodies"), "rocket_bodies");

  async function refreshEnabled() {
    await Promise.all(enabledModes.map((mode) =>
      mode === "active" ? active.refresh() : mode === "debris" ? debris.refresh() : rocketBodies.refresh()));
  }

  return { active, debris, rocketBodies, refreshEnabled };
}
