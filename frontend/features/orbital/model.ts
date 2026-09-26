export type Satellite = {
  readonly id: string;
  readonly noradId: number;
  readonly name: string;
  readonly epoch: string;
  readonly meanMotion: number;
  readonly eccentricity: number;
  readonly inclination: number;
  readonly rightAscension: number;
  readonly argOfPericenter: number;
  readonly meanAnomaly: number;
  readonly bstar: number;
  readonly meanMotionDot: number;
  readonly meanMotionDdot: number;
  readonly ephemerisType: number;
  readonly classificationType: string;
  readonly elementSetNo: number;
  readonly revolutionNumber: number;
  readonly objectType: string | null;
  readonly operationalStatus: "active" | "inactive" | null;
  readonly owner: string | null;
  readonly ownerCode: string | null;
  readonly launchDate: string | null;
  readonly launchSite: string | null;
  readonly launchSiteCode: string | null;
  readonly internationalDesignator: string | null;
  readonly apogeeKm: number | null;
  readonly perigeeKm: number | null;
  readonly apsidesEstimated: boolean;
  readonly orbitClass: string | null;
  readonly missionType: string | null;
  readonly constellation: string | null;
  readonly orbitalPeriodMinutes: number | null;
  readonly orbitsPerDay: number | null;
};

export type OrbitalMode = "active" | "debris" | "rocket_bodies";

export type OrbitalObject = Satellite & { readonly orbitalMode: OrbitalMode };

export type SatellitesResponse = {
  readonly category: "active";
  readonly mode: OrbitalMode;
  readonly fetchedAt: number;
  readonly stale: boolean;
  readonly metadataStale: boolean;
  readonly satellites: readonly Satellite[];
};

export function reuseSatelliteCatalog(previous: SatellitesResponse | undefined, incoming: SatellitesResponse): SatellitesResponse {
  if (!previous || previous.fetchedAt !== incoming.fetchedAt) return incoming;
  return { ...incoming, satellites: previous.satellites };
}

export type SelectedSatellitePosition = {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitudeKm: number;
  readonly velocityKmS: number;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isSatellite(value: unknown): value is Satellite {
  if (!value || typeof value !== "object") return false;
  const satellite = value as Record<string, unknown>;
  return typeof satellite.id === "string"
    && typeof satellite.noradId === "number"
    && typeof satellite.name === "string"
    && typeof satellite.epoch === "string"
    && typeof satellite.meanMotion === "number"
    && typeof satellite.eccentricity === "number"
    && typeof satellite.inclination === "number"
    && typeof satellite.rightAscension === "number"
    && typeof satellite.argOfPericenter === "number"
    && typeof satellite.meanAnomaly === "number"
    && typeof satellite.bstar === "number"
    && typeof satellite.meanMotionDot === "number"
    && typeof satellite.meanMotionDdot === "number"
    && typeof satellite.ephemerisType === "number"
    && typeof satellite.classificationType === "string"
    && typeof satellite.elementSetNo === "number"
    && typeof satellite.revolutionNumber === "number"
    && isNullableString(satellite.objectType)
    && (satellite.operationalStatus === null || satellite.operationalStatus === "active" || satellite.operationalStatus === "inactive")
    && isNullableString(satellite.owner)
    && isNullableString(satellite.ownerCode)
    && isNullableString(satellite.launchDate)
    && isNullableString(satellite.launchSite)
    && isNullableString(satellite.launchSiteCode)
    && isNullableString(satellite.internationalDesignator)
    && isNullableNumber(satellite.apogeeKm)
    && isNullableNumber(satellite.perigeeKm)
    && typeof satellite.apsidesEstimated === "boolean"
    && isNullableString(satellite.orbitClass)
    && isNullableString(satellite.missionType)
    && isNullableString(satellite.constellation)
    && isNullableNumber(satellite.orbitalPeriodMinutes)
    && isNullableNumber(satellite.orbitsPerDay);
}

export function isPayload(value: unknown, mode: OrbitalMode): value is SatellitesResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return payload.category === "active"
    && payload.mode === mode
    && typeof payload.fetchedAt === "number"
    && typeof payload.stale === "boolean"
    && typeof payload.metadataStale === "boolean"
    && Array.isArray(payload.satellites)
    && payload.satellites.every(isSatellite);
}
