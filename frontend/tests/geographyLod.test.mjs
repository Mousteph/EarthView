import assert from "node:assert/strict";
import test from "node:test";
import { nextGeographicLod } from "../globe/geography/geography.ts";

test("Surface keeps the lower-cost 50m geography at every zoom", () => {
  assert.equal(nextGeographicLod("50m", 1.2, true), "50m");
  assert.equal(nextGeographicLod("10m", 1.2, true), "50m");
});

test("10m geography retains its close-range hysteresis when Surface is off", () => {
  assert.equal(nextGeographicLod("50m", 2.14, false), "10m");
  assert.equal(nextGeographicLod("10m", 2.3, false), "10m");
  assert.equal(nextGeographicLod("10m", 2.46, false), "50m");
  assert.equal(nextGeographicLod("50m", 2.3, false), "50m");
});
