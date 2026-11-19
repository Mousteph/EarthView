import assert from "node:assert/strict";
import test from "node:test";
import { resolveHoverTooltip } from "../features/map/hover.ts";
import { isSevereEvent } from "../features/severe-events/model.ts";
import { SEVERE_EVENT_REFRESH_INTERVAL_MS, shouldRefreshSevereEvents } from "../features/severe-events/refreshPolicy.ts";
import { routeRangeForSegment } from "../globe/pipelines/picking.ts";

const earthquake = { id: "q1", place: "Near the coast", magnitude: 5.4 };
const fire = { id: "f1", frp: null, confidence: "High" };
const severeEvent = { id: "FL:1", eventType: "FL", lat: 1, lon: 2, title: "Flood in Testland", description: null, link: null, categories: [{ id: "floods", title: "Floods" }], alertLevel: "Green", severity: null, country: "Testland", startedAt: 1, updatedAt: 2 };
const satellite = { id: "s1", name: "ISS", objectType: "PAYLOAD", orbitalMode: "active" };
const pipeline = { id: "gas:p1", name: "North Route", fuel: "gas", type: "Gas", status: "Operating", lengthKm: 420 };
const data = {
  earthquakes: [earthquake], fires: [fire], severeEvents: [severeEvent], orbitalObjects: [satellite], orbitalVisibility: Uint8Array.of(1),
  earthquakesVisible: true, firesVisible: true, enabledSevereEventCategories: ["floods"], satellitesVisible: true,
  pipelines: [pipeline], pipelinesVisible: true, orbitalColorFor: () => "#587b83",
};

test("hover tooltip resolves concise identifying information for each data layer", () => {
  assert.deepEqual(resolveHoverTooltip({ type: "earthquakes", id: "q1" }, data), {
    type: "earthquakes", title: "Near the coast", label: "Earthquake", detail: "Magnitude 5.4", accent: "var(--color-earthquake)",
  });
  assert.deepEqual(resolveHoverTooltip({ type: "fires", id: "f1" }, data), {
    type: "fires", title: "Active fire", label: "Fire", detail: "High confidence", accent: "var(--color-fire)",
  });
  assert.deepEqual(resolveHoverTooltip({ type: "severe-events", id: "FL:1" }, data), {
    type: "severe-events", title: "Flood in Testland", label: "Floods", detail: "Green alert", accent: "var(--color-severe-floods)",
  });
  assert.deepEqual(resolveHoverTooltip({ type: "satellites", id: "s1" }, data), {
    type: "satellites", title: "ISS", label: "Satellite", detail: "PAYLOAD", accent: "#587b83",
  });
  assert.deepEqual(resolveHoverTooltip({ type: "pipelines", id: "gas:p1" }, data), {
    type: "pipelines", title: "North Route", label: "Gas pipeline · Gas", detail: "Operating", accent: "var(--color-pipeline-gas)",
  });
});

test("hover tooltip is cleared when a layer or filtered record is unavailable", () => {
  assert.equal(resolveHoverTooltip({ type: "earthquakes", id: "q1" }, { ...data, earthquakesVisible: false }), null);
  assert.equal(resolveHoverTooltip({ type: "fires", id: "missing" }, data), null);
  assert.equal(resolveHoverTooltip({ type: "severe-events", id: "FL:1" }, { ...data, enabledSevereEventCategories: [] }), null);
  assert.equal(resolveHoverTooltip({ type: "satellites", id: "s1" }, { ...data, orbitalVisibility: Uint8Array.of(0) }), null);
  assert.equal(resolveHoverTooltip({ type: "pipelines", id: "gas:p1" }, { ...data, pipelinesVisible: false }), null);
});

test("GDACS event validation checks coordinates, categories, and update timestamp", () => {
  assert.equal(isSevereEvent(severeEvent), true);
  assert.equal(isSevereEvent({ ...severeEvent, lat: 91 }), false);
  assert.equal(isSevereEvent({ ...severeEvent, categories: [] }), false);
  assert.equal(isSevereEvent({ ...severeEvent, categories: [{ id: "", title: "" }] }), false);
  assert.equal(isSevereEvent({ ...severeEvent, updatedAt: NaN }), false);
  assert.equal(isSevereEvent({ ...severeEvent, eventType: "XX" }), false);
});

test("severe-event feed refreshes on first enable and after six minutes", () => {
  assert.equal(SEVERE_EVENT_REFRESH_INTERVAL_MS, 6 * 60 * 1000);
  assert.equal(shouldRefreshSevereEvents(false, 0, 0), true);
  assert.equal(shouldRefreshSevereEvents(true, 1_000, 1_000 + SEVERE_EVENT_REFRESH_INTERVAL_MS - 1), false);
  assert.equal(shouldRefreshSevereEvents(true, 1_000, 1_000 + SEVERE_EVENT_REFRESH_INTERVAL_MS), true);
});

test("every segmented route hit resolves to its full logical pipeline", () => {
  const ranges = [
    { id: "gas:first", startSegment: 0, segmentCount: 3 },
    { id: "gas:network", startSegment: 3, segmentCount: 5 },
    { id: "gas:last", startSegment: 8, segmentCount: 1 },
  ];
  assert.equal(routeRangeForSegment(ranges, 3)?.id, "gas:network");
  assert.equal(routeRangeForSegment(ranges, 7)?.id, "gas:network");
  assert.equal(routeRangeForSegment(ranges, 8)?.id, "gas:last");
  assert.equal(routeRangeForSegment(ranges, 9), null);
});
