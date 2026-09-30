import assert from "node:assert/strict";
import test from "node:test";
import { isPipelineFeed } from "../features/pipelines/model.ts";

const pipeline = {
  id: "gas:P12",
  projectId: "P12",
  fuel: "gas",
  type: "Gas",
  name: "Example Pipeline",
  segmentName: null,
  status: "Operating",
  countries: "Example",
  owner: null,
  parent: null,
  operator: null,
  lengthKm: 120,
  capacity: "4.2",
  capacityUnit: "bcm/year",
  startYear: "2020",
  sourceUrl: null,
  routeAccuracy: "high",
  routes: [[[10, 20], [11, 21]]],
};

const feed = {
  fuel: "gas",
  dataset: "Global Gas Infrastructure Tracker",
  release: "November 2025",
  source: "Global Energy Monitor",
  sourceUrl: "https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker",
  fetchedAt: 1,
  stale: false,
  pipelines: [pipeline],
};

test("accepts a well-formed shared pipeline feed", () => {
  assert.equal(isPipelineFeed(feed, "gas"), true);
});

test("rejects fuel mismatches and invalid route coordinates", () => {
  assert.equal(isPipelineFeed(feed, "oil"), false);
  assert.equal(isPipelineFeed({ ...feed, pipelines: [{ ...pipeline, routes: [[[181, 20], [11, 21]]] }] }, "gas"), false);
  assert.equal(isPipelineFeed({ ...feed, pipelines: [{ ...pipeline, id: 1 }] }, "gas"), false);
});
