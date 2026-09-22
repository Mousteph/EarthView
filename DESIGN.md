# EarthView Design Reference

## Direction

EarthView is a quiet editorial instrument: a single interactive globe on a warm printed-paper field. Geographic data is the detail; the interface remains spare, flat, and deliberate.

## Palette

- Parchment: `#e5e4e0`
- Ink: `#1d1d1d`
- Ash: `#bfbebe`
- Petrol ocean: `#0a2d2d`
- Land: `#e5e4e0`
- Country lines: `#73726f`

Do not use cool atmospheric glows, drop shadows, satellite imagery, map tiles, or gradients on the globe.

## Typography and page chrome

Use a tight-tracked geometric sans-serif. Ataero Retina OB is the intended licensed face; until it is available, use the documented Inter/system fallback. Keep the visible stage to an EarthView wordmark, a micro context label, a large two-line `EARTH / VIEW` display, and an interaction hint. Labels are uppercase, 11px, and letter-spaced. The display uses a 0.8 line-height.

Keep the stage free of decorative concentric circles so the globe and geographic detail remain the sole visual focus.

## Globe

Use the locally bundled official Natural Earth 1:10m Admin-0 country polygons as the single source for both land and country outlines. Densify each ring once, then reuse those exact vertices for the triangulated land edge and its border so both layers remain aligned at close zoom. Keep the ocean, land, and border meshes separate. The ocean is at `1.0`; land and borders share radius `1.0015`, with a depth-only polygon offset on the land preventing flicker without moving either layer. Border materials never write depth.

The globe begins with a slow automatic rotation. Any touch, drag, or scroll stops that rotation. Orbit interaction uses low drag and zoom sensitivity, remains damped, and permits precise inspection just above the globe surface without camera clipping.
