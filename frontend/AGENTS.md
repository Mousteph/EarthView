# Frontend guide

## Structure and ownership

- `app/` contains the map route (`page.tsx`), the data-source route (`data/page.tsx`), and the CSS entry point (`globals.css`). Route components should delegate map behavior to `features/map/MapView.tsx`.
- `features/earthquakes/`, `features/fires/`, and `features/orbital/` own their normalized models, response validation, feed hooks, feature filters/colors, and detail content. Earthquakes and fires share only the array-feed mechanics in `shared/data/useArrayFeed.ts`; orbital feeds keep their distinct mode, refresh, and cache behavior.
- `features/map/` composes features and owns enabled layer state, orbital filters, and selection. `selection.ts` is the single selection validity rule.
- `globe/` owns rendering: `GlobeScene.tsx` composes the scene; `geography/` owns geometry preparation and LOD; `relief/` owns Earth shading; `points/PointLayer.tsx` batches static points; `orbital/` owns the specialized satellite renderer, propagation worker, and message protocol; `debug/` owns renderer diagnostics.
- `shared/` contains only cross-feature utilities and UI primitives. `globe/geo.ts` converts geographic coordinates into Three.js vectors; `shared/designTokens.ts` bridges CSS colors to Three.js.
- `styles/design-tokens.css` is the source of truth for fixed colors and shared visual values. `layout.css`, `controls.css`, and `data-page.css` consume those tokens. `globals.css` imports them in cascade order.

## Data and rendering boundaries

The flow is provider response → backend normalization → frontend feature validation → typed renderer props. Do not pass external-provider payloads directly to globe components, or make feature feed hooks depend on globe code. Keep frontend API paths and response shapes aligned with the FastAPI routes unless an API change is explicitly in scope.

Static earthquake and fire points use the shared batched point renderer; do not add one React component or Three.js mesh per entity. Satellite propagation remains specialized and worker-backed. Preserve the worker protocol, catalog ordering, and render scheduling unless a measured change requires a scoped update.

Selection remains valid only while its item exists, its layer or orbital mode is enabled, and it passes its active filter. Reconcile selection after visibility changes, filter changes, and feed refreshes. Preserve the satellite disclosure behavior in the layer controls.

## Visual rules

Consult `../DESIGN.md` before changing globe appearance, interaction, layout, or responsive behavior. Preserve the editorial globe, page chrome, panels, typography, colors, animation, and narrow-screen controls. Put fixed color values in `styles/design-tokens.css`; use semantic token names in stylesheets and the typed bridge for Three.js. Resolve CSS color values on the client after mount, never while rendering on the server. Deterministic generated colors remain appropriate for unknown orbital categories.

## Adding or changing a feature

1. Inspect the nearest existing feature and its backend response before choosing files or changing contracts.
2. Define or update the feature-owned normalized model and validation.
3. Add the feed hook and feature-specific filters/formatting beside that model. Reuse `shared/data/useArrayFeed.ts` only when the endpoint follows the earthquake/fire array-feed lifecycle.
4. Compose the feature explicitly in `features/map/`; keep map state/selection there and keep feature hooks independent from Three.js.
5. Add typed props to the scene and implement rendering under the relevant `globe/` responsibility. Batch large point collections and use a worker only when the computation warrants it.
6. Add or update the controls and feature detail content using the shared UI primitives. Add any fixed color as a semantic design token.
7. Preserve responsive layout, loading/error/stale states, refresh semantics, and selection validity. Keep API changes and performance changes separate from a structural move where possible.

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

Start the API separately from `backend/`; Next rewrites `/api/*` to `http://127.0.0.1:8000` by default. Set `EARTHVIEW_API_ORIGIN` before starting Next.js to use a different API origin. Use `?debug=1` for development renderer diagnostics.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
