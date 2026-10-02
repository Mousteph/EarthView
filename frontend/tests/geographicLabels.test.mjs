import assert from "node:assert/strict";
import test from "node:test";
import { ScreenSpatialIndex } from "../globe/interaction/ScreenSpatialIndex.ts";
import {
  isLabelEligible,
  labelOpacityForFacing,
  labelZoom,
  selectNonOverlappingLabels,
} from "../globe/labels/labelMath.ts";

const country = (rank = 1) => ({ id: `country-${rank}`, name: "Country", longitude: 0, latitude: 0, kind: "country", rank });
const city = (id, { rank = 1, capital = false, population = 1_000_000 } = {}) => ({
  id, name: id, longitude: 0, latitude: 0, kind: "city", rank, capital, population,
});
const placed = (record, x, y) => ({ record, x, y, width: 48, height: 14, opacity: 1 });

test("camera distance selects far, medium, and close label tiers", () => {
  assert.equal(labelZoom(4.26), "far");
  assert.equal(labelZoom(4.25), "medium");
  assert.equal(labelZoom(2.15), "close");
});

test("city labels adapt to zoom without depending on Surface visibility", () => {
  const majorCity = city("major", { rank: 1 });
  const capital = city("capital", { rank: 6, capital: true });

  assert.equal(isLabelEligible(majorCity, "medium"), true);
  assert.equal(isLabelEligible(capital, "medium"), true);
  assert.equal(isLabelEligible(city("small", { rank: 4 }), "close"), true);
  assert.equal(isLabelEligible(city("small", { rank: 6 }), "close"), false);
});

test("priority and approximate bounds prevent lower-ranked overlaps", () => {
  const candidates = [
    placed(city("secondary", { rank: 5 }), 100, 100),
    placed(city("capital", { rank: 4, capital: true }), 100, 100),
    placed(country(2), 100, 100),
    placed(country(5), 160, 100),
  ];
  const visible = selectNonOverlappingLabels(candidates, 300, 200);

  assert.deepEqual(visible.map(({ record }) => record.id), ["country-2", "country-5"]);
});

test("back-side labels are hidden and horizon labels fade in", () => {
  assert.equal(labelOpacityForFacing(-0.2), 0);
  assert.equal(labelOpacityForFacing(0.015), 0);
  assert.ok(labelOpacityForFacing(0.1) > 0 && labelOpacityForFacing(0.1) < 1);
  assert.equal(labelOpacityForFacing(0.3), 1);
});

test("screen-space collision snapshots invalidate on resize and meaningful rotation", () => {
  const index = new ScreenSpatialIndex();
  const identity = new Float64Array([1, 0, 0, 0]);
  const snapshot = { width: 320, height: 568, cameraWorld: identity, cameraProjection: identity,
    objectWorld: identity, cameraDistance: 5, source: {} };
  index.reset(snapshot);
  assert.equal(index.isStale(snapshot), false);
  assert.equal(index.isStale({ ...snapshot, width: 321 }), true);
  assert.equal(index.isStale({ ...snapshot, cameraWorld: new Float64Array([0.99, 0.1, 0, 0]) }), true);
});
