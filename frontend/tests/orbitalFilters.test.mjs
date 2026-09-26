import assert from "node:assert/strict";
import test from "node:test";
import { orbitalFilterMask, orbitalFilterOptions, visibleOrbitalCount } from "../features/orbital/filters.ts";

const catalog = [
  { missionType: "Communications", orbitClass: "Low Earth Orbit", constellation: "Starlink" },
  { missionType: "Communications", orbitClass: "Geosynchronous Orbit", constellation: "Intelsat" },
  { missionType: "Navigation", orbitClass: "Medium Earth Orbit", constellation: "Galileo" },
  { missionType: "Science", orbitClass: "Low Earth Orbit", constellation: null },
];

test("filter options include every classified value present in the feed", () => {
  const options = orbitalFilterOptions(catalog);
  assert.deepEqual(options.missionTypes, ["Communications", "Navigation", "Science"]);
  assert.deepEqual(options.orbitClasses, ["Geosynchronous Orbit", "Low Earth Orbit", "Medium Earth Orbit"]);
  assert.deepEqual(options.constellations, ["Galileo", "Intelsat", "Other / Unclassified", "Starlink"]);
});

test("multiple values within a group use OR and groups use AND", () => {
  const mask = orbitalFilterMask(catalog, {
    missionTypes: ["Communications", "Navigation"],
    orbitClasses: ["Low Earth Orbit", "Medium Earth Orbit"],
    constellations: [],
  });
  assert.deepEqual([...mask], [1, 0, 1, 0]);
  assert.equal(visibleOrbitalCount(mask), 2);
});

test("empty groups admit all and unclassified objects can be selected", () => {
  assert.deepEqual([...orbitalFilterMask(catalog, { missionTypes: [], orbitClasses: [], constellations: [] })], [1, 1, 1, 1]);
  assert.deepEqual([...orbitalFilterMask(catalog, {
    missionTypes: [], orbitClasses: [], constellations: ["Other / Unclassified"],
  })], [0, 0, 0, 1]);
});
