# Frontend agent guide

Use this guide for Next.js routes, React features, styles, and Three.js rendering. The root [AGENTS.md](../AGENTS.md) defines repository-wide contracts. Read [../DESIGN.md](../DESIGN.md) before changing visual treatment, geography, camera behavior, or globe interaction.

## Ownership

- `app/` owns the map route, `/data` source page, and global CSS entry. Keep route composition focused; map behavior belongs in `features/map/MapView.tsx`.
- `features/<layer>/` owns a layer's frontend model, API response validation, feed hook, filter helpers, formatting, and detail content. Keep feature hooks independent from globe components.
- `features/map/` owns enabled layer and sublayer state, cross-layer composition, filter selections, and selection validity. `selection.ts` defines selection rules.
- `globe/` owns the scene and rendering: geography and LOD, relief, batched event points, satellite propagation/rendering, and diagnostics.
- `shared/` is for cross-feature utilities and UI primitives. Keep feature hooks independent from globe components.
- `styles/design-tokens.css` is the source for fixed colors and shared visual values. CSS uses semantic tokens; Three.js uses `shared/designTokens.ts`, resolving CSS values after mount.

## Change workflow

1. **Trace the feed.** Inspect the frontend model and hook plus the matching backend route/model before changing a feed. Completion: the response shape, validation point, and feature owner are identified.
2. **Keep feature behavior local.** Put a layer's feed validation, lifecycle, filter helpers, formatting, and details in `features/<layer>/`. Reuse a shared loader only when its lifecycle matches; retain feature-specific cache or worker behavior when it differs. Completion: each data concern has one clear owner and a typed boundary.
3. **Compose deliberately.** Put layer and sublayer visibility, filter selections, and selection rules in `features/map/`, then pass normalized typed data through `GlobeScene.tsx` to the relevant renderer. Batch large static feature sets; keep high-rate or propagated data in its existing worker-backed path. Completion: the renderer receives the intended visible feature set and feature hooks import no globe code.
4. **Preserve user behavior.** Reconcile selection after feed refreshes, layer or sublayer toggles, and filter changes. Keep loading, error, stale-data, refresh, disclosure, keyboard, pointer, and narrow-screen behavior consistent with existing features. Define what each displayed count measures, especially when it differs from a provider's total. Completion: affected state transitions and count semantics are covered by tests or inspected in the browser as appropriate.
5. **Use current framework guidance.** Before changing Next.js APIs or conventions, read the relevant installed guide under `node_modules/next/dist/docs/`. Completion: the implementation follows the installed Next.js version's guidance.
6. **Verify the scope.** Run applicable frontend commands from `frontend/`; start the backend separately when feed integration requires it. Use `?debug=1` for renderer diagnostics; production diagnostics also require `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` at build time. Completion: report exact checks and distinguish build/type checks from browser or GPU verification.

## Contracts to preserve

- Keep API paths and response shapes aligned with FastAPI unless an API change is explicitly requested.
- `globe/geo.ts` owns geographic-to-Three.js coordinate conversion.
- Selection remains open only while the item exists, its layer/mode is enabled, and it passes the active filter.
- **Controls:** Use `LayerRow` and the existing expandable controls as references. Put sublayer choices and their filters inside the parent layer disclosure; keep parent disclosure separate from visibility toggles, and keep sibling sublayers independently selectable.
- **Filters:** When options come from provider categories, derive them from the validated feed and represent missing values explicitly. Follow the existing multiselect convention when appropriate: selected values are included, and an empty selection means all. Reconcile stale filter values after feed changes.
- **Visible data:** Pass one filtered feature set to both rendering and selection. Define displayed counts in terms users can understand, and distinguish mapped/filtered records from source totals when those populations differ.
- **Rendering:** Share model preparation, batching, picking, and selection logic when sibling sublayers have the same geometry and interaction needs. Keep styling data-specific through semantic tokens; do not build a universal layer registry for a single use case.
- **Details:** Reuse `InspectionPanel` and existing detail hierarchy. Keep the category eyebrow and metadata neutral, use the layer's semantic accent for its primary selected name or value, and format incomplete provider metadata for display without implying missing facts.
- **Attribution:** Keep dataset-level source, release, and license information on `/data` and in the README. Add item-level source links to a detail panel when they help inspect that record.
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
