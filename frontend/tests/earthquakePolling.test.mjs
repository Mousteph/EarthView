import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './helpers/loadComponent.mjs';
import { EARTHQUAKE_REFRESH_MS } from '../features/earthquakes/merge.ts';

test('earthquake polling stops when disabled and re-enable respects six-minute request age', async () => {
  const originalWindow = globalThis.window, originalNow = Date.now;
  let now = 1_000_000, requests = 0, cursor = 0, intervalId = 0;
  const cells = [], effects = [], intervals = new Map();
  const feed = { entities: [{ id: 'retained' }], hasLoaded: true, error: null, refresh: async () => { requests++; return feed.error ? null : feed.entities; } };
  const react = {
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useState(value) { const index = cursor++; cells[index] ??= typeof value === 'function' ? value() : value; return [cells[index], (next) => { cells[index] = next; }]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) { const index = cursor++; const old = cells[index]; if (!old || deps.some((d, i) => d !== old.deps[i])) { old?.cleanup?.(); effects.push(() => { cells[index] = { deps, cleanup: fn() }; }); } },
  };
  const { useEarthquakes: runHook } = loadComponent(new URL('../features/earthquakes/useEarthquakes.ts', import.meta.url), {
    react, '@/shared/data/useArrayFeed': { useArrayFeed: () => feed }, './model': { isEarthquake: () => true }, './merge': { EARTHQUAKE_REFRESH_MS },
  });
  const render = async (enabled) => { cursor = 0; const result = runHook(enabled); effects.splice(0).forEach((e) => e()); await Promise.resolve(); return result; };
  try {
    Date.now = () => now;
    globalThis.window = { setInterval(fn, delay) { assert.equal(delay, EARTHQUAKE_REFRESH_MS); intervals.set(++intervalId, fn); return intervalId; }, clearInterval(id) { intervals.delete(id); } };
    await render(false); assert.equal(requests, 0);
    await render(true); assert.equal(requests, 1);
    now += EARTHQUAKE_REFRESH_MS;
    [...intervals.values()][0](); await Promise.resolve(); assert.equal(requests, 2);
    await render(false); assert.equal(intervals.size, 0);
    now += 1000; await render(true); assert.equal(requests, 2);
    await render(false); now += EARTHQUAKE_REFRESH_MS;
    feed.error = 'Provider unavailable';
    const failed = await render(true); assert.equal(requests, 3); assert.equal(failed.stale, true); assert.equal(failed.earthquakes, feed.entities);
    await render(false); assert.equal(intervals.size, 0);
  } finally { globalThis.window = originalWindow; Date.now = originalNow; }
});
