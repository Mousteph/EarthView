# EarthView Design Reference

## Direction

EarthView is a quiet editorial instrument: a single interactive globe on a warm white field. Geographic data is the detail; the interface remains spare, flat, and deliberate. The September 2026 stage mockups define the current page layout.

## Palette

- Warm white: `#faf9f6`
- Ink: `#1d1d1d`
- Ash: `#bfbebe`
- Ocean blue: `#0a3554`
- Land: `#f0efeb`
- Country lines: `#969590`
- Earthquakes: `#e65342`
- Active fires: `#f5a23b`

Do not use cool atmospheric glows, drop shadows, satellite imagery, map tiles, or gradients on the globe.

## Typography and page chrome

Use a tight-tracked geometric sans-serif. Ataero Retina OB is the intended licensed face; until it is available, use the documented Inter/system fallback. The desktop stage has an EarthView masthead, `REAL-TIME EARTH DATA`, live UTC time and status, VIEW and DATA navigation, layer controls with inline counts, a large `VIEW.` display at the lower left, and a right-side inspection prompt or selected-event panel. The display title sits behind the globe and becomes occluded as it is zoomed; its dot uses the same orange as `Data sources.`. Labels are uppercase, letter-spaced, and deliberately small. Layers start off, with satellite options collapsed. Selection markers are outlined when off and filled when on. Counts appear beside the names of selected layers and orbital categories after they load; the satellite heading sums only selected, loaded orbital categories. The `/data` page lists the current data sources without the globe. On narrow screens, reduce the globe stage so controls remain usable. Give the header and floating controls nearly opaque parchment backdrops so text stays readable over the globe without heavy cards.

Inspection cards share a heading, primary value, divider, and compact detail rows. Earthquake magnitude uses earthquake red; fire power uses fire orange and confidence appears as a pill. The globe supports drag and wheel zoom without on-screen zoom buttons.

An active earthquake uses a restrained screen-space leader: a fine segmented line running from a ring around the selected marker to the event panel. The selected dark point remains visible inside that ring, and the leader disappears when the marker is not camera-facing.

Do not add About, Journal, Research, search, or a compass until those features are requested. Keep the stage free of decorative concentric circles so the globe and geographic detail remain the sole visual focus.

## Globe

Use the locally bundled official Natural Earth Admin-0 country polygons as the single source for both land and country outlines. Use 1:50m in the global view and switch to 1:10m for close inspection. Densify each ring once, then reuse those exact vertices for the triangulated land edge and its border so both layers remain aligned at close zoom. Keep the ocean, land, and border meshes separate. The ocean is at `1.0`; land and borders share radius `1.0015`. That physical separation prevents ocean/land z-fighting without a slope-based polygon offset, which is unstable near the globe limb. Borders never write depth and render only on the camera-facing hemisphere.

The LOD transition enters 1:10m below camera distance `2.15` and returns to 1:50m above `2.45`. This hysteresis is intentional. Geographic triangles must be wound outward and remain front-sided; border fragments are clipped to the camera-facing hemisphere to prevent rear geometry leaking around the limb.

The globe opens with Europe and Africa facing the viewer, then begins a slow automatic rotation. Any touch, drag, or scroll stops that rotation. Orbit interaction uses low drag and zoom sensitivity, remains damped, and permits precise inspection just above the globe surface without camera clipping.
