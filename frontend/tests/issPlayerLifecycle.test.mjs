import assert from "node:assert/strict";
import test from "node:test";
import { initialISSPlayerLifecycle, issPlayerLifecycleReducer, shouldMountISSPlayer } from "../features/orbital/issPlayerLifecycle.ts";

const transition = (state, ...actions) => actions.reduce(issPlayerLifecycleReducer, state);

test("mounts the inline player only while the ISS is selected", () => {
  const selected = transition(initialISSPlayerLifecycle, { type: "selection", isISSSelected: true });
  assert.equal(shouldMountISSPlayer(selected), true);
  const closed = transition(selected, { type: "selection", isISSSelected: false });
  assert.equal(shouldMountISSPlayer(closed), false);
});

test("detached player survives selection and panel changes until its own close", () => {
  const detached = transition(initialISSPlayerLifecycle,
    { type: "selection", isISSSelected: true }, { type: "detach" },
    { type: "selection", isISSSelected: false });
  assert.equal(detached.detached, true);
  assert.equal(shouldMountISSPlayer(detached), true);

  const closed = transition(detached, { type: "close" });
  assert.equal(closed.detached, false);
  assert.equal(shouldMountISSPlayer(closed), false);
  assert.equal(shouldMountISSPlayer(transition(closed, { type: "show" })), false);
  assert.equal(shouldMountISSPlayer(transition(closed, { type: "selection", isISSSelected: true })), true);
  const closedWhileSelected = transition(initialISSPlayerLifecycle,
    { type: "selection", isISSSelected: true }, { type: "close" });
  assert.equal(shouldMountISSPlayer(closedWhileSelected), false);
  assert.equal(shouldMountISSPlayer(transition(closedWhileSelected, { type: "show" })), true);
});

test("docks only when the ISS panel is selected", () => {
  const detached = transition(initialISSPlayerLifecycle, { type: "selection", isISSSelected: true }, { type: "detach" });
  const otherSelection = transition(detached, { type: "selection", isISSSelected: false }, { type: "dock" });
  assert.equal(otherSelection.detached, true);
  const ISSSelectedAgain = transition(otherSelection, { type: "selection", isISSSelected: true }, { type: "dock" });
  assert.equal(ISSSelectedAgain.detached, false);
  assert.equal(shouldMountISSPlayer(ISSSelectedAgain), true);
});

test("shows the unavailable state after an iframe error and clears it on retry", () => {
  const selected = transition(initialISSPlayerLifecycle, { type: "selection", isISSSelected: true });
  const unavailable = transition(selected, { type: "error" });
  assert.equal(unavailable.unavailable, true);
  const retrying = transition(unavailable, { type: "retry" });
  assert.equal(retrying.unavailable, false);
  assert.equal(shouldMountISSPlayer(retrying), true);
});
