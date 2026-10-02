import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_VISUAL_LAYER_STATE, toggleVisualLayer } from "../features/map/visualLayers.ts";

test("visual layer toggles compose independently across all four combinations", () => {
  const states = new Set([JSON.stringify(INITIAL_VISUAL_LAYER_STATE)]);
  for (const layer of ["labels", "surface"]) {
    for (const state of [...states].map((value) => JSON.parse(value))) {
      states.add(JSON.stringify(toggleVisualLayer(state, layer)));
    }
  }
  assert.equal(states.size, 4);
});

test("toggling one visual layer leaves sibling layers unchanged", () => {
  const current = { labels: true, surface: false };
  assert.deepEqual(toggleVisualLayer(current, "surface"), { labels: true, surface: true });
});
