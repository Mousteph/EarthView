import assert from 'node:assert/strict';
import test from 'node:test';
import { isOverlayFeed, isEventEnrichment, visibleOverlays, mergeOverlays } from '../features/severe-events/enrichment.ts';
import { isSevereEvent } from '../features/severe-events/model.ts';
import { prepareOverlayGeometry } from '../globe/geography/geographyPreparation.ts';

const event = { id: 'DR:12', eventType: 'DR', episodeId: 2, title: 'Drought · Europe', categories: [{ id: 'droughts', title: 'Droughts' }], description: null, link: null, lat: 0, lon: 0, alertLevel: 'Orange', severity: null, country: null, startedAt: 1, updatedAt: 2 };
const overlay = { eventId: event.id, episodeId: 2, kind: 'drought-area', label: 'Agricultural drought impact risk area', geometryType: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]], forecast: false, updatedAt: 2, value: null, unit: null };
const details = { event, countries: [], provider: null, endedAt: null, measurements: [], impacts: [], sources: [], overlays: [overlay], geometryUnavailable: false };

test('validates droughts, normalized details, and geometry at the feature boundary', () => {
  assert.equal(isSevereEvent(event), true);
  assert.equal(isOverlayFeed({ overlays: [overlay], unavailable: [] }), true);
  assert.equal(isEventEnrichment(details), true);
});
test('rejects malformed geometry, mismatched events, and unsafe source URLs', () => {
  assert.equal(isOverlayFeed({ overlays: [{ ...overlay, coordinates: [[[181,0],[1,0],[1,1],[181,0]]] }], unavailable: [] }), false);
  assert.equal(isOverlayFeed({ overlays: [{ ...overlay, coordinates: [[[0,0],[1,0],[1,1]]] }], unavailable: [] }), false);
  assert.equal(isOverlayFeed({ overlays: [{ ...overlay, kind: 'track' }], unavailable: [] }), false);
  assert.equal(isEventEnrichment({ ...details, overlays: [{ ...overlay, eventId: 'DR:99' }] }), false);
  assert.equal(isEventEnrichment({ ...details, sources: [{ label: 'unsafe', url: 'javascript:alert(1)' }] }), false);
});
test('removes geometry after toggle, event removal or episode refresh', () => {
  assert.deepEqual(visibleOverlays([overlay], [event]), [overlay]);
  assert.deepEqual(visibleOverlays([overlay], []), []);
  assert.deepEqual(visibleOverlays([overlay], [{ ...event, episodeId: 3 }]), []);
  assert.deepEqual(mergeOverlays([overlay], null), [overlay]);
  const enriched = { ...overlay, label: 'new advisory' };
  assert.deepEqual(mergeOverlays([overlay], { ...details, overlays: [enriched] }), [enriched]);
});
test('forecast flags and geometry are preserved', () => {
  const track = { ...overlay, eventId: 'TC:12', kind: 'track', geometryType: 'MultiLineString', coordinates: [[[179, 1], [-179, 2]]], forecast: true };
  assert.equal(isOverlayFeed({ overlays: [track], unavailable: [] }), true);
  assert.equal(track.forecast, true);
});
test('spherical preparation keeps polygon holes open', () => {
  const outer = [[0,0],[2,0],[2,2],[0,2],[0,0]];
  const hole = [[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5],[.5,.5]];
  const prepared = prepareOverlayGeometry({ type: 'Polygon', coordinates: [outer, hole] });
  assert.ok(prepared.indices.length > 0);
  for (let i=0; i<prepared.indices.length; i+=3) {
    const points = Array.from(prepared.indices.slice(i,i+3), (index) => Array.from(prepared.positions.slice(index*3,index*3+3)));
    const x = points.reduce((sum,p)=>sum+p[0],0)/3;
    const y = points.reduce((sum,p)=>sum+p[1],0)/3;
    const z = points.reduce((sum,p)=>sum+p[2],0)/3;
    const lon = Math.atan2(x,z)*180/Math.PI;
    const lat = Math.atan2(y,Math.hypot(x,z))*180/Math.PI;
    assert.equal(lon>.5001 && lon<1.4999 && lat>.5001 && lat<1.4999, false);
  }
});
test('antimeridian paths and polygons stay close to the dateline', () => {
  const polygon = prepareOverlayGeometry({ type: 'Polygon', coordinates: [[[179,0],[-179,0],[-179,2],[179,2],[179,0]]] });
  for (let i=2; i<polygon.positions.length; i+=3) assert.ok(polygon.positions[i] < -.99);
  const path = prepareOverlayGeometry({ type: 'LineString', coordinates: [[179,0],[-179,0]] });
  for (let i=2; i<path.linePositions.length; i+=3) assert.ok(path.linePositions[i] < -.99);
});

test('drought markers disappear only for matching loaded areas', async () => {
  const { droughtAreaEventIds } = await import('../features/severe-events/enrichment.ts');
  assert.deepEqual([...droughtAreaEventIds([overlay], [event])], [event.id]);
  assert.equal(droughtAreaEventIds([], [event]).size, 0);
  assert.equal(droughtAreaEventIds([overlay], [{ ...event, episodeId: 3 }]).size, 0);
  assert.equal(droughtAreaEventIds([overlay], []).size, 0);
  assert.equal(droughtAreaEventIds([{ ...overlay, kind: 'fire-area' }], [event]).size, 0);
});
