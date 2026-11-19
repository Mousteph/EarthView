import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadComponent } from './helpers/loadComponent.mjs';
const dependencies = {
  './SevereEventLegend': { SevereEventLegend: () => createElement('div', null, 'Geometry legend') },
  './categories': { categoryColorToken: () => '--color-severe-other' },
  '@/shared/ui/InspectionPanel': { InspectionPanel: ({ children }) => createElement('section', null, children) },
  '@/shared/ui/format': { formatCoordinates: () => 'Coordinates', formatEventTime: (time) => `Date ${time}` },
};
dependencies['./SevereEventAssessment'] = loadComponent(new URL('../features/severe-events/SevereEventAssessment.tsx', import.meta.url), dependencies);
const { SevereEventDetails } = loadComponent(new URL('../features/severe-events/SevereEventDetails.tsx', import.meta.url), dependencies);
const summary = { id: 'EQ:1', eventType: 'EQ', title: 'Example event', categories: [{ id: 'earthquakes', title: 'Earthquakes' }], alertLevel: 'Green', severity: 'Duplicate magnitude/depth', country: 'Country', lat: 0, lon: 0, startedAt: 1, updatedAt: 2, episodeId: 1 };
const details = { countries: ['Country'], measurements: [{ label: 'Magnitude', value: '4.8' }, { label: 'Depth', value: '35 km' }], overlays: [], sources: [], impacts: [], endedAt: 3, geometryUnavailable: false, provider: null };
function render(event, overrides = {}) {
  return renderToStaticMarkup(createElement(SevereEventDetails, { event, enrichment: { data: { ...details, ...overrides, event }, loading: false, error: null, stale: false }, detailsRef: { current: null }, onClose() {} }));
}

test('all hazard panels put a classified or unknown alert badge beneath the title', () => {
  for (const eventType of ['EQ', 'FL', 'TC', 'VO', 'DR', 'WF']) {
    for (const alertLevel of ['Green', 'Orange', 'Red', null]) {
      const html = render({ ...summary, eventType, alertLevel });
      const badge = alertLevel ? `${alertLevel} alert` : 'Alert unknown';
      assert.ok(html.indexOf('Example event') < html.indexOf(badge));
      assert.ok(html.includes('orbital-info-pill severe-alert-badge'));
      assert.ok(!html.includes('GDACS alert level'));
    }
  }
});

test('earthquake summary retains Started and measurements but removes redundant severity and dates', () => {
  const html = render(summary);
  for (const text of ['Magnitude', '4.8', 'Depth', '35 km', 'Started', 'GDACS has no ShakeMap for this advisory.']) assert.ok(html.includes(text));
  for (const text of ['Duplicate magnitude/depth', 'Latest reported date', 'Reported duration', 'Last updated']) assert.ok(!html.includes(text));
  assert.ok(render({ ...summary, eventType: 'FL' }).includes('Last updated'));
});

test('missing ShakeMap and failed geometry have different explanations; supplied geometry retains its legend', () => {
  const failed = render(summary, { geometryUnavailable: true });
  assert.ok(failed.includes('temporarily unavailable'));
  assert.ok(!failed.includes('GDACS has no ShakeMap'));
  const available = render(summary, { overlays: [{ kind: 'shaking' }] });
  assert.ok(available.includes('Map geometry'));
  assert.ok(available.includes('Geometry legend'));
  assert.ok(!available.includes('GDACS has no ShakeMap'));
});
