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
};

export type SatellitesResponse = {
  readonly category: "active";
  readonly fetchedAt: number;
  readonly stale: boolean;
  readonly satellites: readonly Satellite[];
};

export type SelectedSatellitePosition = {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitudeKm: number;
  readonly velocityKmS: number;
};

const REFRESH_INTERVAL = 2 * 60 * 60 * 1000 + 5 * 60 * 1000;

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
    && typeof satellite.revolutionNumber === "number";
}

function isPayload(value: unknown): value is SatellitesResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return payload.category === "active"
    && typeof payload.fetchedAt === "number"
    && typeof payload.stale === "boolean"
    && Array.isArray(payload.satellites)
    && payload.satellites.every(isSatellite);
}

export function useSatellites(visible: boolean) {
  const [data, setData] = useState<SatellitesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const lastRequestAt = useRef(0);

  const refresh = useCallback(async (): Promise<SatellitesResponse | null> => {
    const currentRequest = ++requestId.current;
    lastRequestAt.current = Date.now();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/satellites", { cache: "no-store" });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const detail = failure && typeof failure === "object" && "detail" in failure ? failure.detail : null;
        throw new Error(typeof detail === "string" ? detail : "Unable to load satellite data");
      }
      const payload: unknown = await response.json();
      if (!isPayload(payload)) throw new Error("Satellite data has an invalid format");
      if (currentRequest === requestId.current) setData(payload);
      return payload;
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load satellite data");
        setData((current) => current ? { ...current, stale: true } : current);
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const initialLoad = !data || Date.now() - lastRequestAt.current >= REFRESH_INTERVAL
      ? window.setTimeout(() => void refresh())
      : undefined;
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL);
    return () => {
      if (initialLoad !== undefined) window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      requestId.current += 1;
    };
  }, [data, refresh, visible]);

  return { satellites: data?.satellites ?? [], hasLoaded: data !== null, isLoading, error, stale: data?.stale ?? false, refresh };
}
