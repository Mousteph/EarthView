import type { SevereEventCategory } from "./categories";

export type SevereEvent = {
  readonly id: string;
  readonly eventType: "EQ" | "FL" | "TC" | "VO" | "WF" | "DR";
  readonly episodeId?: number | null;
  readonly title: string;
  readonly description: string | null;
  readonly link: string | null;
  readonly categories: readonly SevereEventCategory[];
  readonly lat: number;
  readonly lon: number;
  readonly alertLevel: "Green" | "Orange" | "Red" | null;
  readonly severity: string | null;
  readonly country: string | null;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly earthquake?: {
    readonly magnitude: number | null;
    readonly depth: number | null;
    readonly sourceIds: readonly string[];
    readonly sourceUrl: string | null;
  } | null;
};

export function isSevereEventCategory(value: unknown): value is SevereEventCategory {
  return Boolean(value && typeof value === "object"
    && "id" in value && typeof value.id === "string" && value.id.trim()
    && "title" in value && typeof value.title === "string" && value.title.trim());
}

export function isSevereEvent(value: unknown): value is SevereEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === "string" && event.id.length > 0
    && ["EQ", "FL", "TC", "VO", "WF", "DR"].includes(String(event.eventType))
    && (event.episodeId === undefined || event.episodeId === null || (typeof event.episodeId === "number" && Number.isInteger(event.episodeId) && event.episodeId >= 0))
    && typeof event.title === "string" && event.title.length > 0
    && (event.description === null || typeof event.description === "string")
    && (event.link === null || typeof event.link === "string")
    && Array.isArray(event.categories) && event.categories.length > 0 && event.categories.every(isSevereEventCategory)
    && typeof event.lat === "number" && Number.isFinite(event.lat) && event.lat >= -90 && event.lat <= 90
    && typeof event.lon === "number" && Number.isFinite(event.lon) && event.lon >= -180 && event.lon <= 180
    && (event.alertLevel === null || ["Green", "Orange", "Red"].includes(String(event.alertLevel)))
    && (event.severity === null || typeof event.severity === "string")
    && (event.country === null || typeof event.country === "string")
    && typeof event.startedAt === "number" && Number.isFinite(event.startedAt)
    && typeof event.updatedAt === "number" && Number.isFinite(event.updatedAt)
    && (event.earthquake === undefined || event.earthquake === null || isEarthquakeMetadata(event.earthquake));
}

function isEarthquakeMetadata(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return [data.magnitude, data.depth].every((v) => v === null || (typeof v === 'number' && Number.isFinite(v)))
    && Array.isArray(data.sourceIds) && data.sourceIds.every((id) => typeof id === 'string' && id.length > 0)
    && (data.sourceUrl === null || (typeof data.sourceUrl === 'string' && /^https:\/\/earthquake\.usgs\.gov\//.test(data.sourceUrl)));
}
