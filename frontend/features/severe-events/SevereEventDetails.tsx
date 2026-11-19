import type { CSSProperties, RefObject } from "react";
import type { SevereEvent } from "./model";
import type { EventEnrichment } from "./enrichment";
import { SevereEventAssessment } from "./SevereEventAssessment";
import { categoryColorToken } from "./categories";
import { InspectionPanel } from "@/shared/ui/InspectionPanel";
import { formatCoordinates, formatEventTime } from "@/shared/ui/format";

export function SevereEventDetails({ event: summary, enrichment, detailsRef, onClose }: {
  readonly event: SevereEvent;
  readonly enrichment: { readonly data: EventEnrichment | null; readonly loading: boolean; readonly error: string | null; readonly stale: boolean };
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  const data = enrichment.data;
  const event = data?.event ?? summary;
  const categories = event.categories.map((category) => category.title).join(" · ");
  const accent = `var(${categoryColorToken(event.categories[0]?.id ?? "")})`;
  const duration = Math.max(1, Math.ceil(((event.eventType === "DR" ? event.updatedAt : data?.endedAt ?? event.updatedAt) - event.startedAt) / 86_400_000));
  return <InspectionPanel className="severe-event-details" ariaLabel="Selected natural event" closeLabel="Close selected event" detailsRef={detailsRef} onClose={onClose}>
    <div className="event-details-heading"><span>GDACS · {categories}</span></div>
    <div className="event-primary severe-event-primary" style={{ "--severe-event-accent": accent } as CSSProperties}>
      <div><span className="event-primary-caption">{event.eventType === "DR" ? "Ongoing drought" : "Disaster alert"}</span><span>{event.title}</span></div>
      <div className="orbital-primary-badges"><span className={`orbital-info-pill severe-alert-badge severe-alert-${event.alertLevel?.toLowerCase() ?? "unknown"}`}>{event.alertLevel ? `${event.alertLevel} alert` : "Alert unknown"}</span></div>
      {event.description ? <p>{event.description}</p> : null}
    </div>
    {data?.measurements.length ? <div className="orbital-detail-section event-data-section"><h3>Measurements &amp; exposure</h3><dl>{data.measurements.map((m) => <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>)}</dl>{data.measurements.some((m) => m.label.toLowerCase().includes("population")) ? <p className="severe-event-note">Population exposure describes people near or within a hazard area; it does not count casualties.</p> : null}</div> : null}
    <div className="orbital-detail-section event-data-section"><dl>
      {event.country ? <div><dt>Country / region</dt><dd>{data && data.countries.length > 3 ? `${data.countries.length} countries (listed below)` : event.country.replace(/,\s*$/, "")}</dd></div> : null}
      {event.eventType !== "EQ" && event.severity ? <div><dt>Severity</dt><dd>{event.severity}</dd></div> : null}
      <div><dt>Started</dt><dd>{formatEventTime(event.startedAt)}</dd></div>
      {event.eventType !== "EQ" && data?.endedAt ? <div><dt>Latest reported date</dt><dd>{formatEventTime(data.endedAt)}</dd></div> : null}
      {event.eventType !== "EQ" ? <><div><dt>{event.eventType === "DR" ? "Duration at last update" : "Reported duration"}</dt><dd>{duration.toLocaleString()} days</dd></div>
      <div><dt>Last updated</dt><dd>{formatEventTime(event.updatedAt)}</dd></div></> : null}
      <div><dt>Reported location</dt><dd>{formatCoordinates(event.lat, event.lon)}</dd></div>
      {event.episodeId !== null && event.episodeId !== undefined ? <div><dt>Advisory / episode</dt><dd>{event.episodeId}</dd></div> : null}
      {data?.provider ? <div><dt>Reporting provider</dt><dd>{data.provider}</dd></div> : null}
    </dl></div>
    <SevereEventAssessment event={event} enrichment={enrichment} />
    <div className="orbital-detail-section event-data-section"><h3>Sources</h3><ul className="severe-event-sources">{data?.sources.length ? data.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>) : <li><a href={event.link ?? "https://data.gdacs.org/default.aspx"} target="_blank" rel="noreferrer">GDACS event report</a></li>}</ul></div>
  </InspectionPanel>;
}
