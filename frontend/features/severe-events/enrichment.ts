import { isSevereEvent, type SevereEvent } from "./model.ts";

export type Position = [number, number];
export type HazardGeometry =
  | { readonly geometryType: "LineString"; readonly coordinates: Position[] }
  | { readonly geometryType: "MultiLineString"; readonly coordinates: Position[][] }
  | { readonly geometryType: "Polygon"; readonly coordinates: Position[][] }
  | { readonly geometryType: "MultiPolygon"; readonly coordinates: Position[][][] };
export type SevereEventOverlay = HazardGeometry & {
  readonly eventId: string;
  readonly episodeId: number | null;
  readonly kind: "track" | "drought-area" | "wind-zone" | "uncertainty" | "flood-area" | "fire-area" | "shaking";
  readonly label: string;
  readonly forecast: boolean;
  readonly updatedAt: number | null;
  readonly value: number | null;
  readonly unit: string | null;
};
export type OverlayFeed = { readonly overlays: readonly SevereEventOverlay[]; readonly unavailable: readonly string[] };
export type EventEnrichment = {
  readonly event: SevereEvent;
  readonly countries: readonly string[];
  readonly provider: string | null;
  readonly endedAt: number | null;
  readonly measurements: readonly { readonly label: string; readonly value: string }[];
  readonly impacts: readonly { readonly description: string; readonly region: string | null; readonly reportedAt: number | null; readonly startedAt: number | null; readonly endedAt: number | null }[];
  readonly sources: readonly { readonly label: string; readonly url: string }[];
  readonly overlays: readonly SevereEventOverlay[];
  readonly geometryUnavailable: boolean;
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object"; }
function nullableNumber(value: unknown) { return value === null || (typeof value === "number" && Number.isFinite(value)); }
function nullableText(value: unknown) { return value === null || typeof value === "string"; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function position(value: unknown) {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180
    && typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
}
function line(value: unknown, ring = false) {
  return Array.isArray(value) && value.length >= (ring ? 4 : 2) && value.every(position)
    && (!ring || (value[0][0] === value[value.length - 1][0] && value[0][1] === value[value.length - 1][1]));
}
function polygon(value: unknown) { return Array.isArray(value) && value.length > 0 && value.every((ring) => line(ring, true)); }
export function isSevereEventOverlay(value: unknown): value is SevereEventOverlay {
  if (!record(value)) return false;
  const geometryValid = value.geometryType === "LineString" ? line(value.coordinates)
    : value.geometryType === "MultiLineString" ? Array.isArray(value.coordinates) && value.coordinates.length > 0 && value.coordinates.every((path) => line(path))
      : value.geometryType === "Polygon" ? polygon(value.coordinates)
        : value.geometryType === "MultiPolygon" && Array.isArray(value.coordinates) && value.coordinates.length > 0 && value.coordinates.every(polygon);
  return !!geometryValid && typeof value.eventId === "string" && /^(EQ|FL|TC|DR|WF|VO):\d+$/.test(value.eventId)
    && nullableNumber(value.episodeId) && typeof value.label === "string" && typeof value.forecast === "boolean"
    && ["track", "drought-area", "wind-zone", "uncertainty", "flood-area", "fire-area", "shaking"].includes(String(value.kind))
    && nullableNumber(value.updatedAt) && nullableNumber(value.value) && nullableText(value.unit)
    && ((value.kind === "track") === ["LineString", "MultiLineString"].includes(String(value.geometryType)));
}
export function isOverlayFeed(value: unknown): value is OverlayFeed {
  return record(value) && Array.isArray(value.overlays) && value.overlays.every(isSevereEventOverlay) && strings(value.unavailable);
}
export function isEventEnrichment(value: unknown): value is EventEnrichment {
  return record(value) && isSevereEvent(value.event) && strings(value.countries) && nullableText(value.provider) && nullableNumber(value.endedAt)
    && Array.isArray(value.measurements) && value.measurements.every((m) => record(m) && typeof m.label === "string" && typeof m.value === "string")
    && Array.isArray(value.impacts) && value.impacts.every((i) => record(i) && typeof i.description === "string" && nullableText(i.region) && nullableNumber(i.reportedAt) && nullableNumber(i.startedAt) && nullableNumber(i.endedAt))
    && Array.isArray(value.sources) && value.sources.every((s) => record(s) && typeof s.label === "string" && typeof s.url === "string" && /^https:\/\/(www\.|data\.)?gdacs\.org\//.test(s.url))
    && Array.isArray(value.overlays) && value.overlays.every((o) => isSevereEventOverlay(o) && o.eventId === (value.event as SevereEvent).id)
    && typeof value.geometryUnavailable === "boolean";
}
export function visibleOverlays(overlays: readonly SevereEventOverlay[], events: readonly SevereEvent[]) {
  const current = new Map(events.map((event) => [event.id, event]));
  return overlays.filter((overlay) => { const event = current.get(overlay.eventId); return event && (event.episodeId ?? null) === overlay.episodeId; });
}
export function mergeOverlays(overview: readonly SevereEventOverlay[], details: EventEnrichment | null) {
  return details ? [...overview.filter((o) => o.eventId !== details.event.id), ...details.overlays] : overview;
}

export function droughtAreaEventIds(overlays: readonly SevereEventOverlay[], events: readonly SevereEvent[]): ReadonlySet<string> {
  return new Set(visibleOverlays(overlays, events).filter((overlay) => overlay.kind === "drought-area").map((overlay) => overlay.eventId));
}
