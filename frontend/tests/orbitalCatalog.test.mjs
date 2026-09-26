import test from "node:test";
import assert from "node:assert/strict";
import { reuseSatelliteCatalog } from "../features/orbital/model.ts";

const satellite = { id: "25544" };
const previous = {
  category: "active",
  mode: "active",
  fetchedAt: 1_800_000_000_000,
  stale: false,
  metadataStale: false,
  satellites: [satellite],
};

test("reuses the satellite catalog for the same backend feed revision", () => {
  const incoming = { ...previous, stale: true, satellites: [{ id: "25544" }] };
  const result = reuseSatelliteCatalog(previous, incoming);

  assert.equal(result.stale, true);
  assert.equal(result.satellites, previous.satellites);
});

test("accepts a new satellite catalog when the backend feed revision changes", () => {
  const incoming = { ...previous, fetchedAt: previous.fetchedAt + 1, satellites: [{ id: "25544" }] };
  const result = reuseSatelliteCatalog(previous, incoming);

  assert.equal(result.fetchedAt, incoming.fetchedAt);
  assert.equal(result.satellites, incoming.satellites);
});
