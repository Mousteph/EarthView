import type { SevereEvent } from './model';
import type { EventEnrichment } from './enrichment';
import { SevereEventLegend } from './SevereEventLegend';
import { formatEventTime } from '@/shared/ui/format';

export type EnrichmentState = { readonly data: EventEnrichment | null; readonly loading: boolean; readonly error: string | null; readonly stale: boolean };

export function SevereEventAssessment({ event, enrichment }: { readonly event: SevereEvent; readonly enrichment: EnrichmentState }) {
  const data = enrichment.data;
  return <>
    {enrichment.stale && !enrichment.error ? <p className="severe-event-status" role="status">Updating advisory · showing previous details</p> : null}
    {enrichment.loading ? <p className="severe-event-status" role="status">Loading additional event data…</p> : null}
    {enrichment.error ? <p className="severe-event-status" role="status">{enrichment.error}{enrichment.stale ? " · showing previous details" : ""}</p> : null}

    {data?.countries.length ? <div className="orbital-detail-section"><h3>Affected countries</h3><p className="severe-event-note">{data.countries.join(" · ")}</p></div> : null}
    {data?.overlays.length ? <div className="orbital-detail-section"><h3>Map geometry</h3><SevereEventLegend overlays={data.overlays} /></div> : null}
    {data?.geometryUnavailable ? <p className="severe-event-note">Additional geometry is temporarily unavailable. The reported point remains visible.</p> : data && !data.overlays.length ? <p className="severe-event-note">{event.eventType === "EQ" ? "GDACS has no ShakeMap for this advisory." : "GDACS has no supported affected-area geometry for this advisory."}</p> : null}
    {event.eventType === "DR" ? <p className="severe-event-note">Areas represent agricultural drought impact risk reviewed by GDACS. The underlying hazard indicator updates every ten days.</p> : null}
    {data?.impacts.length ? <div className="orbital-detail-section"><h3>Reported impacts</h3><p className="severe-event-note">Individual reports can overlap in location and time; values are not added together.</p><details className="severe-impact-reports"><summary>{data.impacts.length} dated reports · newest first</summary>{data.impacts.map((impact, index) => <article key={index}><p>{impact.description}</p>{impact.region ? <small>{impact.region}</small> : null}{impact.reportedAt ? <small>Reported {formatEventTime(impact.reportedAt)}</small> : null}{impact.startedAt ? <small>Period {formatEventTime(impact.startedAt)}{impact.endedAt ? ` – ${formatEventTime(impact.endedAt)}` : ""}</small> : null}</article>)}</details></div> : null}
  </>;
}
