import assert from "node:assert/strict";
import test from "node:test";
import { matrixChanged, pickingMatrixTolerance, ScreenSpatialIndex } from "../globe/interaction/ScreenSpatialIndex.ts";

test("screen index finds nearby points and deduplicates long segments across cells", () => {
  const index = new ScreenSpatialIndex(16);
  index.reset(320, 200);
  index.insertPoint(25, 25, 1);
  index.insertPoint(250, 140, 2);
  index.insertSegment(14, 80, 288, 80, 3, 5);

  assert.deepEqual([...index.query(26, 24, 4)], [1]);
  assert.deepEqual([...index.query(151, 82, 4)], [3]);
  assert.deepEqual([...index.query(250, 140, 4)], [2]);
  assert.deepEqual([...index.query(40, 150, 3)], []);
});

test("screen picking refreshes its camera cache more tightly near the globe", () => {
  const closeTolerance = pickingMatrixTolerance(1.15);
  const farTolerance = pickingMatrixTolerance(8);
  const previous = new Float64Array([0]);

  assert.ok(closeTolerance < farTolerance);
  assert.equal(matrixChanged([closeTolerance * 1.1], previous, closeTolerance), true);
  assert.equal(matrixChanged([closeTolerance * 0.9], previous, closeTolerance), false);
});
