import assert from "node:assert/strict";
import test from "node:test";
import { isInternationalSpaceStation } from "../features/orbital/model.ts";
import { resolveSelection } from "../features/map/selection.ts";

const iss = { id: "25544", noradId: 25544, name: "ISS (ZARYA)", orbitalMode: "active" };
const otherSatellite = { id: "12345", noradId: 12345, name: "International Space Station", orbitalMode: "active" };

test("identifies the ISS by NORAD catalog number, independent of catalog order or display name", () => {
  const catalog = [otherSatellite, iss];

  assert.equal(catalog.find(isInternationalSpaceStation), iss);
  assert.equal(isInternationalSpaceStation(otherSatellite), false);
});

test("ISS selection still requires an enabled, visible catalog item", () => {
  const data = {
    earthquakes: [], fires: [], orbitalObjects: [otherSatellite, iss], orbitalVisibility: Uint8Array.of(1, 1),
    earthquakesVisible: true, firesVisible: true, enabledOrbitalModes: ["active"], selectedSatellitePosition: null,
    pipelines: [], enabledPipelineFuels: [],
  };

  assert.equal(resolveSelection({ type: "satellites", id: iss.id }, data)?.event, iss);
  assert.equal(resolveSelection({ type: "satellites", id: iss.id }, { ...data, orbitalVisibility: Uint8Array.of(1, 0) }), null);
  assert.equal(resolveSelection({ type: "satellites", id: iss.id }, { ...data, enabledOrbitalModes: [] }), null);
});
