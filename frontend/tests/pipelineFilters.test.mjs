import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_PIPELINE_STATUS_FILTERS,
  filterPipelines,
  pipelineStatusOptions,
  reconcilePipelineStatusFilters,
  togglePipelineStatus,
} from "../features/pipelines/filters.ts";
import { formatPipelineStakeholders } from "../features/pipelines/format.ts";

const pipeline = (fuel, id, status) => ({ id, fuel, status });
const catalog = [
  pipeline("gas", "g1", "Operating"),
  pipeline("gas", "g2", "Under construction"),
  pipeline("gas", "g3", null),
  pipeline("oil", "o1", "Operating"),
  pipeline("oil", "o2", "Cancelled"),
];

test("status options are derived per fuel and expose records without a status", () => {
  assert.deepEqual(pipelineStatusOptions(catalog), {
    gas: ["Operating", "Under construction", "Unspecified"],
    oil: ["Cancelled", "Operating"],
  });
});

test("status filters include selected values per fuel and empty selections show all", () => {
  assert.deepEqual(filterPipelines(catalog, EMPTY_PIPELINE_STATUS_FILTERS), catalog);
  assert.deepEqual(filterPipelines(catalog, {
    gas: ["Operating", "Unspecified"],
    oil: ["Cancelled"],
  }).map(({ id }) => id), ["g1", "g3", "o2"]);
});

test("status selections toggle and reconcile when feed values change", () => {
  assert.deepEqual(togglePipelineStatus([], "Operating"), ["Operating"]);
  assert.deepEqual(togglePipelineStatus(["Operating", "Cancelled"], "Operating"), ["Cancelled"]);
  assert.deepEqual(reconcilePipelineStatusFilters({ gas: ["Operating", "Shelved"], oil: ["Cancelled"] }, {
    gas: ["Operating"], oil: ["Operating"],
  }), { gas: ["Operating"], oil: [] });
});

test("stakeholder formatting removes unknown shares and keeps known ownership readable", () => {
  assert.equal(formatPipelineStakeholders("WIGA Transport [unknown %]"), "WIGA Transport");
  assert.equal(formatPipelineStakeholders("NaTran [100.%]"), "NaTran (100% ownership)");
  assert.equal(formatPipelineStakeholders("NaTran; [unknown %]"), "NaTran");
  assert.equal(formatPipelineStakeholders("unknown [unknown %]"), "unknown");
  assert.equal(formatPipelineStakeholders("[Unknown %]"), null);
});
