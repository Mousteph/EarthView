import { useDataLayer } from "./dataLayer";

export type Earthquake = {
  readonly id: string;
  readonly place: string;
  readonly lat: number;
  readonly lon: number;
  readonly magnitude: number;
  readonly location: string;
  readonly time: number;
  readonly depth: number;
};

function isEarthquake(value: unknown): value is Earthquake {
  if (!value || typeof value !== "object") return false;

  const earthquake = value as Record<string, unknown>;
  return typeof earthquake.id === "string"
    && typeof earthquake.place === "string"
    && typeof earthquake.lat === "number"
    && typeof earthquake.lon === "number"
    && typeof earthquake.magnitude === "number"
    && typeof earthquake.location === "string"
    && typeof earthquake.time === "number"
    && typeof earthquake.depth === "number";
}

export function useEarthquakes() {
  const { entities, ...state } = useDataLayer("/api/earthquakes", "Earthquake", isEarthquake, false);
  return { earthquakes: entities, ...state };
}
