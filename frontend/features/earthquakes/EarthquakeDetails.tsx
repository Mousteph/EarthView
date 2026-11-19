import type { RefObject } from 'react';
import type { MergedEarthquake } from './model';
import { earthquakeSources } from './merge';
import { SevereEventAssessment, type EnrichmentState } from '@/features/severe-events/SevereEventAssessment';
import { InspectionPanel } from '@/shared/ui/InspectionPanel';
import { formatCoordinates, formatEventTime } from '@/shared/ui/format';

export function EarthquakeDetails({ event, enrichment, detailsRef, onClose }: {
  readonly event: MergedEarthquake;
  readonly enrichment: EnrichmentState;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  const gdacs = event.gdacs;
  const data = enrichment.data?.event.id === gdacs?.id ? enrichment.data : null;
  const exposure = data?.measurements.filter((m) => !['Magnitude', 'Depth'].includes(m.label)) ?? [];
  return <InspectionPanel className="severe-event-details" ariaLabel="Selected earthquake" closeLabel="Close selected event" detailsRef={detailsRef} onClose={onClose}>
    <div className="event-details-heading"><span>Earthquake</span></div>
    <div className="event-primary earthquake-event-primary">
      <div className="earthquake-primary-label">{event.place}</div>
      <div className="orbital-primary-badges">
        {earthquakeSources(event).map((source) => <span className="orbital-info-pill" key={source}>{source}</span>)}
        {gdacs ? <span className={`orbital-info-pill severe-alert-badge severe-alert-${gdacs.alertLevel?.toLowerCase() ?? 'unknown'}`}>{gdacs.alertLevel ? `${gdacs.alertLevel} alert` : 'Alert unknown'}</span> : null}
      </div>
    </div>
    <div className="orbital-detail-section event-data-section"><h3>Measurements &amp; exposure</h3><dl>
      <div><dt>Magnitude</dt><dd>{event.magnitude === null ? 'Unavailable' : event.magnitude.toFixed(1)}</dd></div>
      <div><dt>Depth</dt><dd>{event.depth === null ? 'Unavailable' : `${event.depth.toFixed(1)} km`}</dd></div>
      {exposure.map((m) => <div key={m.label}><dt>GDACS · {m.label}</dt><dd>{m.value}</dd></div>)}
    </dl>{exposure.some((m) => m.label.toLowerCase().includes('population')) ? <p className="severe-event-note">Population exposure describes people within a hazard area; it does not count casualties.</p> : null}</div>
    <div className="orbital-detail-section event-data-section"><dl>
      <div><dt>Started</dt><dd>{formatEventTime(event.time)}</dd></div>
      <div><dt>Coordinates</dt><dd>{formatCoordinates(event.lat, event.lon)}</dd></div>
      {gdacs?.episodeId != null ? <div><dt>GDACS advisory</dt><dd>{gdacs.episodeId}</dd></div> : null}
    </dl></div>
    {gdacs ? <SevereEventAssessment event={gdacs} enrichment={{ ...enrichment, data }} /> : null}
    <div className="orbital-detail-section event-data-section"><h3>Sources</h3>
      {event.matchBasis ? <p className="severe-event-note">{event.matchBasis === 'id' ? 'Reports matched by a shared event identifier.' : 'Inferred association: one unambiguous match within 60 seconds, 50 km, and 0.5 magnitude.'}</p> : null}
      <ul className="severe-event-sources">
        {event.usgs ? <li><a href={event.usgs.sourceUrl ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(event.usgs.id)}`} target="_blank" rel="noreferrer">USGS earthquake report</a>{event.usgs.updatedAt ? <small>Updated {formatEventTime(event.usgs.updatedAt)}</small> : null}</li> : null}
        {gdacs ? <li><a href={gdacs.link ?? 'https://data.gdacs.org/default.aspx'} target="_blank" rel="noreferrer">GDACS event report</a><small>Updated {formatEventTime(gdacs.updatedAt)}</small>
          {event.usgs && gdacs.earthquake && (gdacs.earthquake.magnitude !== event.magnitude || gdacs.earthquake.depth !== event.depth) ? <small>GDACS reports magnitude {gdacs.earthquake.magnitude ?? 'unavailable'}; depth {gdacs.earthquake.depth === null ? 'unavailable' : `${gdacs.earthquake.depth} km`}.</small> : null}
        </li> : null}
        {data?.sources.filter((source) => source.url !== gdacs?.link && source.url !== event.usgs?.sourceUrl).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}
      </ul>
    </div>
  </InspectionPanel>;
}
