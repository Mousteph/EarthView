import type { RefObject } from "react";
import type { Fire } from "./model";
import { InspectionPanel } from "@/shared/ui/InspectionPanel";
import { formatCoordinates, formatEventTime } from "@/shared/ui/format";

const satelliteNames: Record<string, string> = { N20: "NOAA-20", N21: "NOAA-21", N: "Suomi NPP" };
const formatFirePower = (megawatts: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(megawatts)} MW`;

export function FireDetails({ event, detailsRef, onClose }: {
  readonly event: Fire;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  const satellite = satelliteNames[event.satellite ?? ""] ?? event.satellite;
  const source = [satellite, event.instrument].filter(Boolean).join(" / ");
  return <InspectionPanel ariaLabel="Selected active fire" closeLabel="Close selected event" detailsRef={detailsRef} onClose={onClose}>
    <div className="event-details-heading"><span>Active fire</span></div>
    <div className="event-primary">
      <div className="fire-primary-label"><span className="event-primary-caption">Fire Radiative Power</span>
        <span>{event.frp === null ? "Unavailable" : formatFirePower(event.frp)}</span></div>
      {event.confidence ? <div className="orbital-primary-badges"><span className="orbital-info-pill fire-confidence-pill">{event.confidence} confidence</span></div> : null}
    </div>
    <div className="orbital-detail-section event-data-section"><dl>
      <div><dt>Detection</dt><dd>{formatEventTime(event.time)}</dd></div>
      {source ? <div><dt>Satellite</dt><dd>{source}</dd></div> : null}
      <div><dt>Coordinates</dt><dd>{formatCoordinates(event.lat, event.lon)}</dd></div>
    </dl></div>
  </InspectionPanel>;
}
