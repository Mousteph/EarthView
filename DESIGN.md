# EarthView design reference

Read this guide before changing the globe's visual treatment, geography, camera behavior, controls, or responsive layout. Keep the experience an editorial instrument for inspecting current Earth data: the Earth and its data lead; controls and detail panels remain quiet and legible.

## Visual system

- Preserve the custom 3D globe, warm monochrome land, deep blue ocean, restrained relief, and brighter data marks.
- Keep existing panel placement, typography, responsive behavior, motion, and interaction. The map is a full-screen stage; `/data` is the separate text-forward source page.
- Use `frontend/styles/design-tokens.css` as the canonical source for fixed colors, typography, and shared visual values. Use semantic CSS tokens and the typed bridge in `frontend/shared/designTokens.ts` for Three.js colors. Resolve CSS values on the client after mount.
- Keep the current visual hierarchy and palette unless a visual redesign is explicitly requested. Review any token change on both the map and data routes.
- Unknown orbital categories may keep deterministic generated colors.

The reference composition uses a restrained header and left-side layer controls, with inspection content on the right. Keep the satellite modes and filters inside the existing expandable satellite section. On narrow screens, retain usable touch space and the established panel arrangement. Use the current controls and panels as the implementation reference when exact spacing or responsive behavior matters.

## Globe and geography

- Use the bundled Natural Earth geometry for land, coastline, lakes, minor islands, and Admin-0 boundaries. Keep coastlines and political boundaries distinct. Use 1:50m geography globally and 1:10m at close inspection; minor islands join the 10m land mesh.
- Keep ocean, land, lakes, and lines as separate surfaces. Current radii are ocean `1.0`, land/boundaries `1.0015`, and lakes `1.00155`. Preserve outward-facing land triangles; lines render only on the camera-facing hemisphere and do not write depth.
- Preserve LOD hysteresis: enter 1:10m below camera distance `2.15`, return to 1:50m above `2.45`. These thresholds apply across the geography layers.
- Use the bundled GEBCO_2026-derived KTX2 texture for subtle surface shading. Do not turn it into elevation-colored or displaced terrain. Preserve its attribution and safety disclaimer on the `/data` page.
- Keep the globe custom. Do not introduce map tiles, photorealistic imagery, atmosphere halos, decorative rings, heavy shadows, or ornamental gradients.

## Interaction and rendering

- Preserve drag rotation, wheel/pinch zoom, gentle damping, and slow automatic rotation that stops after user interaction. Keep the scale, compass, and debug readouts informational.
- Keep layer toggles, orbital filters, refresh, selection, disclosure, and close actions usable by their existing keyboard and pointer interactions.
- A selection stays visible only while its item exists, its layer or mode is enabled, and it passes the current filter. Reconcile after feed refreshes and visibility changes.
- `frontend/globe/GlobeScene.tsx` composes normalized feature props with geography, relief, batched points, and orbital rendering. Static event points stay batched; satellite propagation stays in its worker-backed renderer.
- Preserve the satellite worker protocol, catalog ordering, and animation scheduling. Keep feature hooks independent from globe renderers; add a shared renderer abstraction only when implemented features demonstrate the need.
- Treat performance claims as unverified until comparable workloads and viewports are measured before and after. Renderer diagnostics require `?debug=1`; production builds also require `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` at build time.

## Source references

For Natural Earth and GEBCO attribution, asset paths, and source limitations, use the [README data-source table](README.md#data-sources) and the `/data` page. This guide records the visual and geometry constraints; the source descriptions belong in those references.
