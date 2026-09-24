import type { Satellite } from "./satellites";

export type OrbitalFilterGroup = "missionTypes" | "orbitClasses" | "constellations";

export type OrbitalFilters = Record<OrbitalFilterGroup, readonly string[]>;

export const EMPTY_ORBITAL_FILTERS: OrbitalFilters = {
  missionTypes: [], orbitClasses: [], constellations: [],
};

const UNCLASSIFIED = "Other / Unclassified";

export function filterValue(value: string | null): string {
  return value ?? UNCLASSIFIED;
}

export function orbitalFilterOptions(satellites: readonly Satellite[]): OrbitalFilters {
  const missionTypes = new Set<string>();
  const orbitClasses = new Set<string>();
  const constellations = new Set<string>();
  for (const satellite of satellites) {
    missionTypes.add(filterValue(satellite.missionType));
    orbitClasses.add(filterValue(satellite.orbitClass));
    constellations.add(filterValue(satellite.constellation));
  }
  return {
    missionTypes: [...missionTypes].sort(),
    orbitClasses: [...orbitClasses].sort(),
    constellations: [...constellations].sort(),
  };
}

export function orbitalFilterMask(satellites: readonly Satellite[], filters: OrbitalFilters): Uint8Array {
  const mission = new Set(filters.missionTypes);
  const orbit = new Set(filters.orbitClasses);
  const constellation = new Set(filters.constellations);
  const result = new Uint8Array(satellites.length);
  for (let index = 0; index < satellites.length; index += 1) {
    const satellite = satellites[index];
    result[index] = Number(
      (mission.size === 0 || mission.has(filterValue(satellite.missionType)))
      && (orbit.size === 0 || orbit.has(filterValue(satellite.orbitClass)))
      && (constellation.size === 0 || constellation.has(filterValue(satellite.constellation))),
    );
  }
  return result;
}

export function visibleOrbitalCount(mask: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) count += mask[index];
  return count;
}
