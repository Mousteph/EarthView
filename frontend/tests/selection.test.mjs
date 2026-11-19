import assert from "node:assert/strict";
import test from "node:test";
import { resolveSelection } from "../features/map/selection.ts";

const quake = { id: "q1" };
const fire = { id: "f1" };
const severeEvent = { id: "EQ:1", categories: [{ id: "earthquakes", title: "Earthquakes" }] };
const orbital = { id: "s1", orbitalMode: "active" };
const pipeline = { id: "gas:P1", fuel: "gas" };
const data = {
  earthquakes: [quake], fires: [fire], severeEvents: [severeEvent], orbitalObjects: [orbital], orbitalVisibility: Uint8Array.of(1),
  earthquakesVisible: true, firesVisible: true, enabledSevereEventCategories: ["earthquakes"], enabledOrbitalModes: ["active"], selectedSatellitePosition: null,
  pipelines: [pipeline], enabledPipelineFuels: ["gas"],
};

test("selection requires its layer and item to remain available", () => {
  assert.equal(resolveSelection({ type: "earthquakes", id: "q1" }, data)?.event, quake);
  assert.equal(resolveSelection({ type: "earthquakes", id: "q1" }, { ...data, earthquakesVisible: false }), null);
  assert.equal(resolveSelection({ type: "fires", id: "f1" }, { ...data, fires: [] }), null);
});

test("natural-event selection requires an enabled category and current filtered item", () => {
  assert.equal(resolveSelection({ type: "severe-events", id: "EQ:1" }, data)?.event, severeEvent);
  assert.equal(resolveSelection({ type: "severe-events", id: "EQ:1" }, { ...data, enabledSevereEventCategories: [] }), null);
  assert.equal(resolveSelection({ type: "severe-events", id: "EQ:1" }, { ...data, severeEvents: [] }), null);
});

test("orbital selection requires an enabled mode and a visible filter result", () => {
  assert.equal(resolveSelection({ type: "satellites", id: "s1" }, data)?.event, orbital);
  assert.equal(resolveSelection({ type: "satellites", id: "s1" }, { ...data, enabledOrbitalModes: [] }), null);
  assert.equal(resolveSelection({ type: "satellites", id: "s1" }, { ...data, orbitalVisibility: Uint8Array.of(0) }), null);
});

test("pipeline selection requires its feed item and enabled fuel", () => {
  assert.equal(resolveSelection({ type: "pipelines", id: "gas:P1" }, data)?.event, pipeline);
  assert.equal(resolveSelection({ type: "pipelines", id: "gas:P1" }, { ...data, enabledPipelineFuels: [] }), null);
  assert.equal(resolveSelection({ type: "pipelines", id: "gas:P1" }, { ...data, pipelines: [] }), null);
});

test('severe-event selection follows alert filters and refreshed classification', async () => {
  const { filterSevereEvents } = await import('../features/severe-events/filters.ts');
  const event = { id: 'EQ:1', categories: [{ id: 'earthquakes', title: 'Earthquakes' }], alertLevel: 'Green' };
  const key = { type: 'severe-events', id: event.id };
  const selected = (catalog, filters) => resolveSelection(key, { ...data, enabledSevereEventCategories: ['earthquakes'], severeEvents: filterSevereEvents(catalog, ['earthquakes'], filters) });
  assert.equal(selected([event], {})?.event.id, event.id);
  assert.equal(selected([event], { earthquakes: ['Red'] }), null);
  assert.equal(selected([{ ...event, alertLevel: 'Red' }], { earthquakes: ['Green'] }), null);
  assert.equal(selected([], {}), null);
});
