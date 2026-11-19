import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponent } from './helpers/loadComponent.mjs';

test('a failed initial pipeline request waits for an explicit retry', async () => {
  const cells = [], effects = [], timers = new Map();
  let cursor = 0, timerId = 0, requests = 0;
  const react = {
    useState(value) {
      const i = cursor++;
      cells[i] ??= value;
      return [cells[i], (next) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }];
    },
    useRef(value) { const i = cursor++; return cells[i] ??= { current: value }; },
    useCallback(fn) { const i = cursor++; return cells[i] ??= fn; },
    useEffect(fn, deps) {
      const i = cursor++, old = cells[i];
      if (!old || deps.some((value, index) => value !== old.deps[index])) {
        old?.cleanup?.();
        effects.push(() => { cells[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const empty = { feed: null, hasLoaded: false, isLoading: false, error: null };
  const { usePipelineFeeds: runHook } = loadComponent(new URL('../features/pipelines/usePipelineFeeds.ts', import.meta.url), {
    react, './model': { EMPTY_PIPELINE_FEED_STATE: empty, isPipelineFeed: () => true },
  });
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const enabled = ['gas'];
  const render = () => { cursor = 0; const result = runHook(enabled); effects.splice(0).forEach((effect) => effect()); return result; };
  try {
    globalThis.window = { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
    globalThis.fetch = async () => { requests++; return { ok: false, json: async () => ({ detail: 'Unavailable' }) }; };
    render();
    const initial = [...timers.values()][0]; timers.clear(); initial();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const failed = render();
    assert.equal(failed.feeds.gas.error, 'Unavailable');
    assert.equal(timers.size, 0);
    assert.equal(requests, 1);
    await failed.refreshEnabled();
    assert.equal(requests, 2);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
