"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export type SelectedSatellitePosition = {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitudeKm: number;
  readonly velocityKmS: number;
};

const REFRESH_INTERVAL = 2 * 60 * 60 * 1000 + 5 * 60 * 1000;
const EMPTY_SATELLITES: readonly Satellite[] = Object.freeze([]);

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

function isPayload(value: unknown, mode: OrbitalMode): value is SatellitesResponse {
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

export function useSatellites(visible: boolean, mode: OrbitalMode = "active") {
  const [feeds, setFeeds] = useState<Partial<Record<OrbitalMode, SatellitesResponse>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const lastRequestAt = useRef<Record<OrbitalMode, number>>({ active: 0, debris: 0, rocket_bodies: 0 });
  const data = feeds[mode] ?? null;

  const refresh = useCallback(async (): Promise<SatellitesResponse | null> => {
    const currentRequest = ++requestId.current;
    lastRequestAt.current[mode] = Date.now();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/satellites?mode=${mode}`, { cache: "no-store" });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const detail = failure && typeof failure === "object" && "detail" in failure ? failure.detail : null;
        throw new Error(typeof detail === "string" ? detail : "Unable to load satellite data");
      }
      const payload: unknown = await response.json();
      if (!isPayload(payload, mode)) throw new Error("Satellite data has an invalid format");
      if (currentRequest === requestId.current) setFeeds((current) => ({ ...current, [mode]: payload }));
      return payload;
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load satellite data");
        setFeeds((current) => current[mode] ? { ...current, [mode]: { ...current[mode], stale: true } } : current);
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!visible) return;
    const initialLoad = !data || Date.now() - lastRequestAt.current[mode] >= REFRESH_INTERVAL
      ? window.setTimeout(() => void refresh())
      : undefined;
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL);
    return () => {
      if (initialLoad !== undefined) window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      requestId.current += 1;
    };
  }, [data, mode, refresh, visible]);

  return { satellites: data?.satellites ?? EMPTY_SATELLITES, hasLoaded: data !== null, isLoading, error, stale: Boolean(data?.stale || data?.metadataStale), refresh };
}
