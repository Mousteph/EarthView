import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCenteredOrbitPath,
  EARTH_RADIUS_KM,
  orbitPeriodMinutes,
  segmentHiddenByEarth,
  snapshotAlpha,
  writeEciToGlobe,
} from "../globe/orbital/satelliteMath.ts";

test("maps inertial coordinates with the fixed Earth rotation", () => {
  const target = new Float32Array(9);
  writeEciToGlobe(target, 0, EARTH_RADIUS_KM, 0, 0, 1, 0);
  writeEciToGlobe(target, 3, 0, EARTH_RADIUS_KM, 0, 1, 0);
  writeEciToGlobe(target, 6, 0, 0, EARTH_RADIUS_KM, 1, 0);
  assert.deepEqual(Array.from(target), [0, 0, 1, 1, 0, 0, 0, 1, 0]);

  writeEciToGlobe(target, 0, EARTH_RADIUS_KM, 0, 0, 0, 1);
  assert.deepEqual(Array.from(target.slice(0, 3)), [-1, 0, 0]);
});

test("clamps interpolation to the five-second snapshot interval", () => {
  assert.equal(snapshotAlpha(0, 1000, 6000), 0);
  assert.equal(snapshotAlpha(3500, 1000, 6000), 0.5);
  assert.equal(snapshotAlpha(8000, 1000, 6000), 1);
});

test("rejects a satellite hidden by Earth from camera view", () => {
  assert.equal(segmentHiddenByEarth(0, 0, 4, 0, 0, -2), true);
  assert.equal(segmentHiddenByEarth(0, 0, 4, 0, 0, 2), false);
  assert.equal(segmentHiddenByEarth(0, 0, 4, 4, 0, 0), false);
});

test("samples equal past and future spans around the exact center time", () => {
  const centerMs = 1_000_000;
  const period = 96;
  const radius = 7000;
  const sampledTimes = [];
  const path = buildCenteredOrbitPath(centerMs, period, 0, (timeMs) => {
    sampledTimes.push(timeMs);
    const angle = ((timeMs - centerMs) / (period * 60_000)) * 2 * Math.PI;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: 0 };
  }, 2);

  assert.ok(path);
  assert.equal(path.length, 15);
  assert.equal(sampledTimes.length, 5);
  assert.equal(sampledTimes[0], centerMs - period * 30_000);
  assert.equal(sampledTimes[2], centerMs);
  assert.equal(sampledTimes[4], centerMs + period * 30_000);
  assert.ok(Math.abs(path[6]) < 1e-6);
  assert.ok(Math.abs(path[8] - radius / EARTH_RADIUS_KM) < 1e-6);
  assert.equal(buildCenteredOrbitPath(centerMs, period, 0, () => null, 2), null);
  assert.equal(buildCenteredOrbitPath(centerMs, period, 0, () => ({ x: radius, y: 0, z: 0 }), 0), null);
});
