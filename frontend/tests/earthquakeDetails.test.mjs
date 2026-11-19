import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './helpers/loadComponent.mjs';
import { composeEarthquake, earthquakeSources } from '../features/earthquakes/merge.ts';
const dependencies = {
  '@/shared/ui/InspectionPanel': loadComponent(new URL('../shared/ui/InspectionPanel.tsx', import.meta.url)),
  '@/shared/ui/format': { formatCoordinates: () => 'Coordinates', formatEventTime: (time) => `Date ${time}` },
  './merge': { earthquakeSources },
  './SevereEventLegend': { SevereEventLegend: () => createElement('div', null, 'Geometry legend') },
};
dependencies['@/features/severe-events/SevereEventAssessment'] = loadComponent(new URL('../features/severe-events/SevereEventAssessment.tsx', import.meta.url), dependencies);
const { EarthquakeDetails } = loadComponent(new URL('../features/earthquakes/EarthquakeDetails.tsx', import.meta.url), dependencies);
const usgs = { id: 'us1', place: 'USGS location', location: 'USGS location', lat: 1, lon: 2, magnitude: 5, depth: 10, time: 1, updatedAt: 2, sourceUrl: 'https://earthquake.usgs.gov/earthquakes/eventpage/us1' };
const gdacs = { id: 'EQ:1', episodeId: 1, eventType: 'EQ', title: 'GDACS location', lat: 1, lon: 2, startedAt: 1, updatedAt: 2, alertLevel: 'Orange', link: 'https://www.gdacs.org/report.aspx?eventid=1', earthquake: { magnitude: 4.9, depth: 12, sourceIds: ['us1'], sourceUrl: usgs.sourceUrl } };
const render = (event, details = null, state = {}) => renderToStaticMarkup(createElement(EarthquakeDetails, { event, enrichment: { data: details, loading: false, error: null, stale: false, ...state }, detailsRef: { current: null }, onClose() {} }));
const details = { event: gdacs, measurements: [{ label: 'Magnitude', value: '4.9' }, { label: 'Depth', value: '12 km' }, { label: 'Population exposure', value: '100 people' }], countries: [], sources: [], impacts: [], overlays: [], geometryUnavailable: false };

test('one common panel leads with USGS, attributes GDACS, and keeps source differences', () => {
  const html = render(composeEarthquake(usgs, gdacs, 'id'), details);
  for (const text of ['USGS location', 'USGS earthquake report', 'GDACS event report', 'Orange alert', 'Started', 'GDACS · Population exposure', '100 people', 'shared event identifier', 'GDACS reports magnitude 4.9; depth 12 km', 'GDACS has no ShakeMap']) assert.ok(html.includes(text), text);
  for (const text of ['Latest reported date', 'Reported duration', '<dt>Last updated', '<dt>Severity']) assert.ok(!html.includes(text), text);
});
test('no assessment creates no GDACS badge, and GDACS-only points use available measurements', () => {
  const usgsOnly = render(composeEarthquake(usgs, null));
  assert.ok(!usgsOnly.includes('alert-badge'));
  assert.ok(!usgsOnly.includes('GDACS event report'));
  const gdacsOnly = render(composeEarthquake(null, gdacs), details);
  assert.ok(gdacsOnly.includes('GDACS location'));
  assert.ok(gdacsOnly.includes('12.0 km'));
  assert.ok(!gdacsOnly.includes('USGS earthquake report'));
});
test('inferred matches, stale enrichment, and missing geometry are labelled accurately', () => {
  const event = composeEarthquake(usgs, gdacs, 'inferred');
  assert.ok(render(event, details).includes('Inferred association'));
  const loading = render(event, null, { loading: true });
  assert.ok(loading.includes('Loading additional event data'));
  assert.ok(loading.includes('USGS location'));
  const failed = render(event, { ...details, geometryUnavailable: true });
  assert.ok(failed.includes('temporarily unavailable'));
  assert.ok(!failed.includes('GDACS has no ShakeMap'));
  const geometry = render(event, { ...details, overlays: [{ kind: 'shaking' }] });
  assert.ok(geometry.includes('Map geometry'));
  assert.ok(geometry.includes('Geometry legend'));
  const unrelated = render(event, { ...details, event: { ...gdacs, id: 'EQ:other' } });
  assert.ok(!unrelated.includes('100 people'));
});
