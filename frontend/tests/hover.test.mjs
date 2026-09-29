import assert from "node:assert/strict";
import test from "node:test";
import { resolveHoverTooltip } from "../features/map/hover.ts";
import { routeRangeForSegment } from "../globe/pipelines/picking.ts";

const earthquake = { id: "q1", place: "Near the coast", magnitude: 5.4 };
const fire = { id: "f1", frp: null, confidence: "High" };
const satellite = { id: "s1", name: "ISS", objectType: "PAYLOAD", orbitalMode: "active" };
const pipeline = { id: "gas:p1", name: "North Route", fuel: "gas", type: "Gas", status: "Operating", lengthKm: 420 };
const data = {
  earthquakes: [earthquake], fires: [fire], orbitalObjects: [satellite], orbitalVisibility: Uint8Array.of(1),
  earthquakesVisible: true, firesVisible: true, satellitesVisible: true,
  pipelines: [pipeline], pipelinesVisible: true, orbitalColorFor: () => "#587b83",
};

test("hover tooltip resolves concise identifying information for each data layer", () => {
  assert.deepEqual(resolveHoverTooltip({ type: "earthquakes", id: "q1" }, data), {
    type: "earthquakes", title: "Near the coast", label: "Earthquake", detail: "Magnitude 5.4", accent: "var(--color-earthquake)",
  });
  assert.deepEqual(resolveHoverTooltip({ type: "fires", id: "f1" }, data), {
    type: "fires", title: "Active fire", label: "Fire", detail: "High confidence", accent: "var(--color-fire)",
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
  assert.equal(resolveHoverTooltip({ type: "satellites", id: "s1" }, { ...data, orbitalVisibility: Uint8Array.of(0) }), null);
  assert.equal(resolveHoverTooltip({ type: "pipelines", id: "gas:p1" }, { ...data, pipelinesVisible: false }), null);
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
