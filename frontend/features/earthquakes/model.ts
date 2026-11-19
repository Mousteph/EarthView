import type { SevereEvent } from '../severe-events/model';

export type EarthquakeSource = 'USGS' | 'GDACS';
export type EarthquakeAlert = 'Green' | 'Orange' | 'Red' | 'Unknown';

export type Earthquake = {
  readonly id: string;
  readonly place: string;
  readonly lat: number;
  readonly lon: number;
  readonly magnitude: number;
  readonly location: string;
  readonly time: number;
  readonly depth: number;
  readonly sourceIds?: readonly string[];
  readonly sourceUrl?: string | null;
  readonly updatedAt?: number | null;
};

export type MergedEarthquake = Omit<Earthquake, 'magnitude' | 'depth'> & {
  readonly magnitude: number | null;
  readonly depth: number | null;
  readonly aliases: readonly string[];
  readonly usgs: Earthquake | null;
  readonly gdacs: SevereEvent | null;
  readonly matchBasis: 'id' | 'inferred' | null;
};

export function isEarthquake(value: unknown): value is Earthquake {
  if (!value || typeof value !== "object") return false;

  const earthquake = value as Record<string, unknown>;
  return typeof earthquake.id === "string"
    && typeof earthquake.place === "string"
    && typeof earthquake.lat === "number"
    && typeof earthquake.lon === "number"
    && typeof earthquake.magnitude === "number"
    && typeof earthquake.location === "string"
    && typeof earthquake.time === "number"
    && typeof earthquake.depth === "number"
    && [earthquake.lat, earthquake.lon, earthquake.magnitude, earthquake.time, earthquake.depth].every(Number.isFinite)
    && Math.abs(earthquake.lat) <= 90 && Math.abs(earthquake.lon) <= 180
    && (earthquake.sourceIds === undefined || (Array.isArray(earthquake.sourceIds) && earthquake.sourceIds.every((id) => typeof id === 'string' && id.length > 0)))
    && (earthquake.sourceUrl === undefined || earthquake.sourceUrl === null || (typeof earthquake.sourceUrl === 'string' && /^https:\/\/earthquake\.usgs\.gov\//.test(earthquake.sourceUrl)))
    && (earthquake.updatedAt === undefined || earthquake.updatedAt === null || (typeof earthquake.updatedAt === 'number' && Number.isFinite(earthquake.updatedAt)));
}
