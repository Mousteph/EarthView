import type { SevereEventOverlay } from "./enrichment";
import { formatEventTime } from "@/shared/ui/format";

export function SevereEventLegend({ overlays }: { readonly overlays: readonly SevereEventOverlay[] }) {
  if (!overlays.length) return null;
  const kinds = new Set(overlays.map((o) => o.kind));
  const dates = overlays.flatMap((o) => o.updatedAt === null ? [] : [o.updatedAt]);
  const intensities = [...new Set(overlays.filter((o) => o.kind === "shaking").map((o) => o.value))].sort((a, b) => (a ?? 0) - (b ?? 0));
  return <div className="severe-event-legend" aria-label="Hazard geometry legend">
    {kinds.has("track") ? <><span><i className="legend-track" />Recorded track</span><span><i className="legend-track forecast" />Forecast track</span></> : null}
    {kinds.has("drought-area") ? <span><i className="legend-area drought" />Agricultural drought impact risk</span> : null}
    {kinds.has("wind-zone") ? <><span><i className="legend-area wind-low" />60 km/h wind zone</span><span><i className="legend-area wind-medium" />90 km/h wind zone</span><span><i className="legend-area wind-high" />120 km/h wind zone</span></> : null}
    {kinds.has("uncertainty") ? <span><i className="legend-area uncertainty" />Forecast uncertainty</span> : null}
    {kinds.has("flood-area") ? <span>Reported flood affected area</span> : null}
    {kinds.has("fire-area") ? <span><i className="legend-area wildfire" />Fire affected area</span> : null}
    {kinds.has("shaking") ? <span>Shaking contours · MMI {intensities.join(", ")}<br />Ochre below V · red from V</span> : null}
    {dates.length ? <small>Geometry dates {formatEventTime(Math.min(...dates))}{new Set(dates).size > 1 ? ` – ${formatEventTime(Math.max(...dates))}` : ""}{overlays.some((o) => o.forecast) ? " · includes forecast times" : ""}</small> : null}
  </div>;
}
