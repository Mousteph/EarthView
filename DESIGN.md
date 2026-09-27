# EarthView design reference

## Product direction

EarthView is a quiet editorial instrument for exploring current Earth data through one interactive globe. The visual hierarchy belongs to the Earth and its data; controls and inspection content stay restrained, readable, and out of the way. The current map shows earthquakes, active fires, and orbital objects. A future layer should follow the established system without being presented as implemented before it ships.

Use a custom graphical globe rather than a conventional slippy map. Keep the Earth warm and monochrome with deep blue oceans and restrained relief; event and orbital marks supply most of the brighter color. Do not add photorealistic imagery, map tiles, an atmosphere halo, decorative concentric circles, heavy shadows, or ornamental gradients.

## Canonical visual values

`frontend/styles/design-tokens.css` is the canonical source for fixed frontend colors, typography, and shared visual values. Use its semantic custom properties in CSS. Three.js materials use the typed bridge in `frontend/shared/designTokens.ts`, with color resolution after mount. Do not duplicate fixed color literals in route styles or renderer color maps.

Token groups cover parchment and ink surfaces, geography, dividers and text, live/error/status states, earthquake/fire/orbital categories, mission categories, and debug panels. Unknown orbital categories may continue to use deterministic generated colors. Keep the existing token values when changing structure; a palette change should update the shared tokens and be visually reviewed across both routes.

Typography uses the shared sans and monospace tokens. The desktop header carries the EarthView wordmark, `REAL-TIME EARTH DATA`, UTC clock/status, and VIEW/DATA navigation. Labels remain compact, uppercase, and letter-spaced. The large `VIEW.` display sits behind the globe and can be occluded by it.

## Map stage and controls

The map is a full-screen stage. Layer controls sit at the left; the inspection area sits at the right. Keep controls and header legible over the globe with the existing parchment surfaces rather than turning them into heavy cards. The layer list exposes earthquakes, active fires, and satellites. Satellite modes and their filters remain inside the expandable satellite section; preserve its disclosure interaction and mode ordering. Layer totals and mode counts appear only as data loads.

When nothing is selected, the inspection area provides the current inspection prompt. A selected earthquake, fire, or orbital object uses a shared inspection shell with feature-owned detail content. Preserve the compact hierarchy, dividers, labels, and feature-specific emphasis. The selected object stays visually identifiable; earthquake selection uses a restrained screen-space leader from the selected marker to the details panel while it is camera-facing.

On narrow screens, shrink and reposition the globe stage so the header, controls, inspection content, and touch interaction remain usable. Preserve the existing responsive breakpoints and panel positions; use the `/data` route as a separate text-forward source page with shared header styling.

## Interaction and motion

The globe supports drag rotation and wheel/pinch zoom without on-screen zoom controls. Keep damping and interaction sensitivity gentle enough for precise inspection. Automatic rotation is slow and stops after a user interaction. The compass/scale and debug affordances remain informational, not competing focal points. Layer toggles, orbital filters, refresh, selection, and close actions must retain their current keyboard and pointer behavior.

Selection is visible only while the selected item exists, its layer or orbital mode is enabled, and it passes the active filter. Clear invalid selections after layer/mode toggles, filter changes, and feed refreshes.

## Globe and geography

Use locally bundled Natural Earth physical layers for land, coastline, lakes, and minor islands, with Admin-0 boundary lines separate from coastlines: 1:50m for the global view and 1:10m for close inspection. Minor islands join the 10m land mesh. Lakes are a separate water-colored surface. Keep ocean, land, lakes, coastlines, and political borders as distinct geometry. Ocean radius is `1.0`; land and borders use `1.0015` and lakes use `1.00155` to avoid z-fighting. Lines do not write depth and render only on the camera-facing hemisphere. Preserve outward-facing land triangles and avoid slope-based polygon offset near the globe limb.

LOD enters 1:10m below camera distance `2.15` and returns to 1:50m above `2.45`; this hysteresis prevents rapid switching around the boundary for all geography layers. Keep the globally bundled GEBCO_2026-derived KTX2 relief texture as surface shading rather than elevation-colored or displaced terrain. Preserve source attribution and the navigation/safety disclaimer on the data references page.

## Rendering conventions

`frontend/globe/GlobeScene.tsx` composes typed feature data with geography, relief, batched points, and orbital rendering. Static event points share a batched renderer. Satellite positions are propagated in the dedicated worker and returned through the explicit worker protocol. Keep feature hooks independent from renderer components and do not introduce a renderer registry before a genuinely different layer requires one.

Keep geometry, camera behavior, worker protocol, and animation scheduling stable during organizational refactors. Treat performance improvements as unproven until the same workloads and viewport are measured before and after. `?debug=1` exposes renderer diagnostics in development; production also needs `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` at build time.

## References

- Canonical visual values: `frontend/styles/design-tokens.css`
- Shared visual rules for contributors: `frontend/AGENTS.md`
- Natural Earth usage and source attribution: `README.md` and the `/data` page
