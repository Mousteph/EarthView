import assert from "node:assert/strict";
import test from "node:test";
import { filterSevereEvents, reconcileSevereEventCategories, severeEventCategoryCounts, toggleSevereEventCategory } from "../features/severe-events/filters.ts";
import { SEVERE_EVENT_CATEGORIES } from "../features/severe-events/categories.ts";

const flood = { id: "1", categories: [{ id: "floods", title: "Floods" }] };
const wildfire = { id: "2", categories: [{ id: "wildfires", title: "Wildfires" }] };
const events = [flood, wildfire];

test("GDACS hazard types are offered as independent sublayers", () => {
  assert.deepEqual(SEVERE_EVENT_CATEGORIES.map(({ id }) => id), [
    "earthquakes", "active-fires", "wildfires", "floods", "cyclones", "volcanoes", "droughts",
  ]);
});

test("category toggles compose, filter by any selected category, and expose counts", () => {
  const selected = toggleSevereEventCategory(toggleSevereEventCategory([], "floods"), "wildfires");
  assert.deepEqual(selected, ["floods", "wildfires"]);
  assert.deepEqual(filterSevereEvents(events, selected), events);
  assert.deepEqual(filterSevereEvents(events, ["floods"]), [flood]);
  assert.deepEqual(filterSevereEvents(events, []), []);
  assert.deepEqual(severeEventCategoryCounts(events), { floods: 1, wildfires: 1 });
  assert.deepEqual(reconcileSevereEventCategories(["floods", "oldCategory"], SEVERE_EVENT_CATEGORIES), ["floods"]);
});

test("alert filters combine levels independently and empty means all", async () => {
  const { severeAlertOptions } = await import('../features/severe-events/filters.ts');
  const green = { ...flood, alertLevel: 'Green' };
  const red = { ...flood, id: '3', alertLevel: 'Red' };
  const orangeFire = { ...wildfire, alertLevel: 'Orange' };
  const unknown = { ...flood, id: '4', alertLevel: null };
  const catalog = [green, red, orangeFire, unknown];
  assert.deepEqual(filterSevereEvents(catalog, ['floods', 'wildfires'], { floods: ['Red'], wildfires: ['Orange'] }), [red, orangeFire]);
  assert.deepEqual(filterSevereEvents(catalog, ['floods'], { floods: ['Green', 'Red'] }), [green, red]);
  assert.deepEqual(filterSevereEvents(catalog, ['floods'], { floods: [] }), [green, red, unknown]);
  assert.deepEqual(filterSevereEvents(catalog, ['floods'], { floods: ['Unknown'] }), [unknown]);
  assert.deepEqual(severeEventCategoryCounts(catalog, { floods: ['Red'] }), { floods: 1, wildfires: 1 });
  assert.deepEqual(severeAlertOptions(catalog, 'floods'), ['Green', 'Orange', 'Red', 'Unknown']);
  assert.deepEqual(severeAlertOptions(catalog, 'wildfires'), ['Green', 'Orange', 'Red']);
});

test('refresh removes obsolete Unknown filters but retains the known alert choices', async () => {
  const { reconcileSevereAlertFilters } = await import('../features/severe-events/filters.ts');
  const filters = { floods: ['Unknown', 'Red'], wildfires: ['Green'] };
  assert.deepEqual(reconcileSevereAlertFilters(filters, [{ ...flood, alertLevel: 'Green' }]), { floods: ['Red'], wildfires: ['Green'] });
  assert.equal(reconcileSevereAlertFilters(filters, [{ ...flood, alertLevel: null }]), filters);
});
