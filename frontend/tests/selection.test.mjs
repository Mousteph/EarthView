import assert from "node:assert/strict";
import test from "node:test";
import { resolveSelection } from "../features/map/selection.ts";

const quake = { id: "q1" };
const fire = { id: "f1" };
const orbital = { id: "s1", orbitalMode: "active" };
const data = {
  earthquakes: [quake], fires: [fire], orbitalObjects: [orbital], orbitalVisibility: Uint8Array.of(1),
  earthquakesVisible: true, firesVisible: true, enabledOrbitalModes: ["active"], selectedSatellitePosition: null,
};

test("selection requires its layer and item to remain available", () => {
  assert.equal(resolveSelection({ type: "earthquakes", id: "q1" }, data)?.event, quake);
  assert.equal(resolveSelection({ type: "earthquakes", id: "q1" }, { ...data, earthquakesVisible: false }), null);
  assert.equal(resolveSelection({ type: "fires", id: "f1" }, { ...data, fires: [] }), null);
});

test("orbital selection requires an enabled mode and a visible filter result", () => {
  assert.equal(resolveSelection({ type: "satellites", id: "s1" }, data)?.event, orbital);
  assert.equal(resolveSelection({ type: "satellites", id: "s1" }, { ...data, enabledOrbitalModes: [] }), null);
  assert.equal(resolveSelection({ type: "satellites", id: "s1" }, { ...data, orbitalVisibility: Uint8Array.of(0) }), null);
});
