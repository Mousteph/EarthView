import type { RefObject } from "react";
import type { Earthquake } from "./model";
import { InspectionPanel } from "@/shared/ui/InspectionPanel";
import { formatCoordinates, formatEventTime } from "@/shared/ui/format";

export function EarthquakeDetails({ event, detailsRef, onClose }: {
  readonly event: Earthquake;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  return <InspectionPanel ariaLabel="Selected earthquake" closeLabel="Close selected event" detailsRef={detailsRef} onClose={onClose}>
    <div className="event-details-heading"><span>Earthquake</span></div>
    <div className="event-primary"><div className="earthquake-primary-label">
      <span className="event-primary-caption">Magnitude</span><span>{event.magnitude.toFixed(1)}</span>
    </div></div>
    <div className="orbital-detail-section event-data-section"><dl>
      <div><dt>Location</dt><dd>{event.location}</dd></div>
      <div><dt>Time</dt><dd>{formatEventTime(event.time)}</dd></div>
      <div><dt>Depth</dt><dd>{event.depth.toFixed(1)} km</dd></div>
      <div><dt>Coordinates</dt><dd>{formatCoordinates(event.lat, event.lon)}</dd></div>
    </dl></div>
  </InspectionPanel>;
}
