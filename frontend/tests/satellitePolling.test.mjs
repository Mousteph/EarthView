import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './helpers/loadComponent.mjs';

test('disabling a satellite mode during refresh clears loading and ignores the late response', async () => {
  const cells = [], effects = [], timers = new Map();
  let cursor = 0, timerId = 0, finish;
  const react = {
    useState(value) {
      const i = cursor++;
      cells[i] ??= value;
      return [cells[i], (next) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }];
    },
    useRef(value) { const i = cursor++; return cells[i] ??= { current: value }; },
    useCallback(fn, deps) {
      const i = cursor++, old = cells[i];
      if (!old || deps.some((value, index) => value !== old.deps[index])) cells[i] = { fn, deps };
      return cells[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++, old = cells[i];
      if (!old || deps.some((value, index) => value !== old.deps[index])) {
        old?.cleanup?.();
        effects.push(() => { cells[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const { useSatellites: runHook } = loadComponent(new URL('../features/orbital/useSatellites.ts', import.meta.url), {
    react,
    './model': { isPayload: () => true, reuseSatelliteCatalog: (_old, next) => next },
    './performance': { recordSatelliteFeedTiming: () => {} },
  });
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const render = (visible) => { cursor = 0; const result = runHook(visible, 'active'); effects.splice(0).forEach((effect) => effect()); return result; };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  try {
    globalThis.window = {
      setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
      clearTimeout(id) { timers.delete(id); },
      setInterval() { return ++timerId; }, clearInterval() {},
    };
    const feed = { satellites: [{ id: 'one' }], stale: false, metadataStale: false };
    globalThis.fetch = async () => ({ ok: true, json: async () => feed });
    render(true);
    [...timers.values()][0](); timers.clear();
    await flush();
    assert.equal(render(true).hasLoaded, true);
    globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
    const request = render(true).refresh();
    assert.equal(render(true).isLoading, true);
    render(false);
    assert.equal(render(true).isLoading, false);
    finish({ ok: true, json: async () => ({ ...feed, satellites: [{ id: 'late' }] }) });
    await request;
    assert.equal(render(true).satellites[0].id, 'one');
    assert.equal(render(true).isLoading, false);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
