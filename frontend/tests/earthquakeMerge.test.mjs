import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeEarthquakes, filterEarthquakes, earthquakeAlertOptions, EARTHQUAKE_WINDOW_MS } from '../features/earthquakes/merge.ts';
import { isEarthquake } from '../features/earthquakes/model.ts';
import { isSevereEvent } from '../features/severe-events/model.ts';
import { resolveSelection } from '../features/map/selection.ts';
const now = Date.UTC(2026, 9, 4, 16);
const u = (id = 'us1', fields = {}) => ({ id, sourceIds: [id], sourceUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, updatedAt: now, place: 'Test quake', location: 'Test quake', lat: 0, lon: 179.9, magnitude: 5, depth: 10, time: now - 100_000, ...fields });
const g = (id = 'EQ:1', fields = {}) => ({ id, eventType: 'EQ', episodeId: 1, title: 'GDACS quake', description: null, link: null, country: null, categories: [{ id: 'earthquakes', title: 'Earthquakes' }], alertLevel: 'Green', severity: null, lat: 0, lon: -179.9, startedAt: now - 100_000, updatedAt: now, earthquake: { magnitude: 5, depth: 12, sourceIds: [], sourceUrl: null }, ...fields });
const merge = (a, b) => mergeEarthquakes(a, b, now);

test('explicit aliases match one point, retain source records, and prefer USGS measurements', () => {
  const usgs = u('us1', { sourceIds: ['us1', 'at2'] });
  const gdacs = g('EQ:1', { earthquake: { magnitude: 6, depth: 100, sourceIds: ['at2'], sourceUrl: null } });
  const result = merge([usgs], [gdacs]);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchBasis, 'id');
  assert.equal(result[0].usgs, usgs);
  assert.equal(result[0].gdacs, gdacs);
  assert.deepEqual([result[0].magnitude, result[0].depth, result[0].lon], [5, 10, 179.9]);
  assert.ok(result[0].aliases.includes('EQ:1'));
  assert.ok(result[0].aliases.includes('at2'));
});

test('inferred matching requires all thresholds and supports the antimeridian', () => {
  assert.equal(merge([u()], [g()])[0].matchBasis, 'inferred');
  const cases = [g('EQ:1', { startedAt: now - 160_001 }), g('EQ:1', { lon: -179 }), g('EQ:1', { earthquake: { magnitude: 5.51, depth: 12, sourceIds: [] } }), g('EQ:1', { earthquake: { magnitude: null, depth: null, sourceIds: [] } })];
  for (const gdacs of cases) assert.equal(merge([u()], [gdacs]).length, 2);
  assert.equal(merge([u()], [g('EQ:1', { startedAt: now - 160_000, earthquake: { magnitude: 5.5, depth: null, sourceIds: [] } })]).length, 1);
  assert.equal(merge([u()], [g('EQ:1', { earthquake: { magnitude: 5, depth: 10, sourceIds: ['differentUSGS'] } })]).length, 2);
});

test('ambiguous aftershocks and competing reports remain separate', () => {
  assert.equal(merge([u('us1'), u('us2')], [g()]).length, 3);
  assert.equal(merge([u()], [g('EQ:1'), g('EQ:2')]).length, 3);
  const reference = { magnitude: 5, depth: 10, sourceIds: ['us1'] };
  assert.equal(merge([u()], [g('EQ:1', { earthquake: reference }), g('EQ:2', { earthquake: reference })]).length, 3);
});

test('occurrence window is inclusive and partial sources remain usable', () => {
  assert.equal(merge([u('edge', { time: now - EARTHQUAKE_WINDOW_MS })], []).length, 1);
  assert.equal(merge([u('old', { time: now - EARTHQUAKE_WINDOW_MS - 1 }), u('future', { time: now + 1 })], []).length, 0);
  assert.equal(merge([], [g('old', { startedAt: now - EARTHQUAKE_WINDOW_MS - 1 })]).length, 0);
  assert.equal(merge([], [g()])[0].gdacs.id, 'EQ:1');
  assert.equal(merge([u()], [])[0].usgs.id, 'us1');
});

test('source filters form a union, alert filters select assessed records, counts stay unique', () => {
  const records = merge([u(), u('usOnly', { time: now - 300_000 })], [g(), g('EQ:unknown', { alertLevel: null, startedAt: now - 400_000 })]);
  assert.equal(records.length, 3);
  assert.equal(filterEarthquakes(records, ['USGS', 'GDACS'], []).length, 3);
  assert.equal(filterEarthquakes(records, ['USGS'], []).length, 2);
  assert.equal(filterEarthquakes(records, ['GDACS'], []).length, 2);
  assert.equal(filterEarthquakes(records, [], ['Green']).length, 1);
  assert.equal(filterEarthquakes(records, [], ['Unknown'])[0].gdacs.id, 'EQ:unknown');
  assert.equal(filterEarthquakes(records, ['USGS'], ['Unknown']).length, 0);
  assert.deepEqual(earthquakeAlertOptions(records), ['Green', 'Orange', 'Red', 'Unknown']);
});

test('selection follows aliases when reports merge, then clears on filter, removal, or toggle', () => {
  const records = merge([u()], [g()]);
  const data = { earthquakes: records, earthquakesVisible: true };
  assert.equal(resolveSelection({ type: 'earthquakes', id: 'EQ:1' }, data).event.id, 'us1');
  assert.equal(resolveSelection({ type: 'earthquakes', id: 'EQ:1' }, { ...data, earthquakes: filterEarthquakes(records, [], ['Red']) }), null);
  assert.equal(resolveSelection({ type: 'earthquakes', id: 'us1' }, { ...data, earthquakes: [] }), null);
  assert.equal(resolveSelection({ type: 'earthquakes', id: 'us1' }, { ...data, earthquakesVisible: false }), null);
  const updated = records.map((record) => ({ ...record, gdacs: { ...record.gdacs, alertLevel: 'Red', episodeId: 2 } }));
  assert.equal(filterEarthquakes(updated, [], ['Green']).length, 0);
});

test('matching metadata is validated at both feature boundaries', () => {
  assert.equal(isEarthquake(u()), true);
  assert.equal(isEarthquake(u('bad', { sourceIds: [3] })), false);
  assert.equal(isEarthquake(u('bad', { lat: 91 })), false);
  assert.equal(isEarthquake(u('bad', { sourceUrl: 'javascript:bad' })), false);
  assert.equal(isSevereEvent(g()), true);
  assert.equal(isSevereEvent(g('bad', { earthquake: { magnitude: NaN, depth: null, sourceIds: [], sourceUrl: null } })), false);
});

test('selection prefers canonical IDs and follows only unambiguous provider aliases', () => {
  const reference = { magnitude: 5, depth: 10, sourceIds: ['us1'], sourceUrl: null };
  const gdacsOnly = merge([], [g('EQ:1', { earthquake: reference })]);
  const key = { type: 'earthquakes', id: 'us1' };
  const data = { earthquakes: gdacsOnly, earthquakesVisible: true };
  assert.equal(resolveSelection(key, data).event.id, 'EQ:1');
  const ambiguous = merge([u()], [g('EQ:1', { earthquake: reference }), g('EQ:2', { earthquake: reference })]);
  assert.equal(resolveSelection(key, { ...data, earthquakes: ambiguous }).event.id, 'us1');
  assert.equal(resolveSelection(key, { ...data, earthquakes: ambiguous.filter((e) => !e.usgs) }), null);
});
