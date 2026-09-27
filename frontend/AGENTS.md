# Frontend agent guide

Use this guide for Next.js routes, React features, styles, and Three.js rendering. The root [AGENTS.md](../AGENTS.md) defines repository-wide contracts. Read [../DESIGN.md](../DESIGN.md) before changing visual treatment, geography, camera behavior, or globe interaction.

## Ownership

- `app/` owns the map route, `/data` source page, and global CSS entry. Keep route composition focused; map behavior belongs in `features/map/MapView.tsx`.
- `features/earthquakes/`, `features/fires/`, and `features/orbital/` own normalized models, API response validation, feed hooks, filters, formatting, and detail content.
- `features/map/` composes features and owns enabled-layer state, orbital filters, and selection. `selection.ts` defines selection validity.
- `globe/` owns the scene and rendering: geography and LOD, relief, batched event points, satellite propagation/rendering, and diagnostics.
- `shared/` is for cross-feature utilities and UI primitives. Keep feature hooks independent from globe components.
- `styles/design-tokens.css` is the source for fixed colors and shared visual values. CSS uses semantic tokens; Three.js uses `shared/designTokens.ts`, resolving CSS values after mount.

## Change workflow

1. **Trace the feed.** Inspect the frontend model and hook plus the matching backend route/model before changing a feed. Completion: the response shape, validation point, and feature owner are identified.
2. **Keep feature behavior local.** Earthquakes and fires may share `shared/data/useArrayFeed.ts` when the endpoint follows that loader's lifecycle. Orbital modes retain their own refresh, cache, validation, and filter behavior. Completion: shared code is used only for a matching lifecycle.
3. **Compose deliberately.** Add feature state and selection rules in `features/map/`, then pass normalized typed data through `GlobeScene.tsx` to the relevant renderer. Batch static points; keep satellite computation in its worker-backed path. Completion: renderers receive typed feature data and feature hooks import no globe code.
4. **Preserve user behavior.** Reconcile selection after feed refreshes, layer or mode toggles, and filter changes. Keep loading, error, stale-data, refresh, disclosure, keyboard, pointer, and narrow-screen behavior consistent with the existing feature. Completion: each affected state transition has been inspected in code or verified in the browser as the task requires.
5. **Use current framework guidance.** Before changing Next.js APIs or conventions, read the relevant installed guide under `node_modules/next/dist/docs/`. Completion: the implementation follows the installed Next.js version's guidance.
6. **Verify the scope.** Run applicable frontend commands from `frontend/`; start the backend separately when feed integration requires it. Use `?debug=1` for renderer diagnostics; production diagnostics also require `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` at build time. Completion: report exact checks and distinguish build/type checks from browser or GPU verification.

## Contracts to preserve

- Keep API paths and response shapes aligned with FastAPI unless an API change is explicitly requested.
- `globe/geo.ts` owns geographic-to-Three.js coordinate conversion.
- Selection remains open only while the item exists, its layer/mode is enabled, and it passes the active filter.
- Preserve the satellite worker message protocol, catalog ordering, and animation scheduling during implementation changes.
- Add fixed visual values through semantic design tokens; unknown orbital categories may use deterministic generated colors.
- Avoid a universal layer registry. Add shared abstractions only when multiple implemented features require the same behavior.

## Commands

Run from `frontend/`:

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm run build
node --test tests/*.test.mjs
```

The frontend rewrites `/api/*` to `http://127.0.0.1:8000` by default. Set `EARTHVIEW_API_ORIGIN` before starting Next.js to use another API origin.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
