# EarthView Design Reference

## Direction

EarthView is a quiet editorial instrument: a single interactive globe on a warm printed-paper field. Geographic data is the detail; the interface remains spare, flat, and deliberate.

## Palette

- Parchment: `#e5e4e0`
- Ink: `#1d1d1d`
- Ash: `#bfbebe`
- Ocean blue: `#0b496f`
- Land: `#e5e4e0`
- Country lines: `#73726f`

Do not use cool atmospheric glows, drop shadows, satellite imagery, map tiles, or gradients on the globe.

## Typography and page chrome

Use a tight-tracked geometric sans-serif. Ataero Retina OB is the intended licensed face; until it is available, use the documented Inter/system fallback. The desktop stage has an EarthView masthead, `REAL-TIME EARTH DATA`, live UTC time, an earthquake data row, a separate `DATA LOADED` summary, a large two-line `EARTH / VIEW` display, a selected-event data panel, and an interaction hint. Labels are uppercase, letter-spaced, and deliberately small. Active layer names use bold weight without an underline. The display uses a 0.8 line-height. When globe geometry sits beneath functional text, use a soft translucent parchment veil with a blurred backdrop; it must be diffuse and borderless, not a card, shadow, or layout change. The display title, loaded data summary, and interaction hint remain behind the transparent globe canvas so geographic geometry can occlude them.

An active earthquake uses a restrained screen-space leader: a fine segmented line running from a ring around the selected marker to the event panel. The selected dark point remains visible inside that ring, and the leader disappears when the marker is not camera-facing.

Do not add top-right navigation, coordinate readouts, title subtitles, global-perspective labels, right-side mission copy, or event-detail CTAs. Keep the stage free of decorative concentric circles so the globe and geographic detail remain the sole visual focus.

## Globe

Use the locally bundled official Natural Earth Admin-0 country polygons as the single source for both land and country outlines. Use 1:50m in the global view and switch to 1:10m for close inspection. Densify each ring once, then reuse those exact vertices for the triangulated land edge and its border so both layers remain aligned at close zoom. Keep the ocean, land, and border meshes separate. The ocean is at `1.0`; land and borders share radius `1.0015`. That physical separation prevents ocean/land z-fighting without a slope-based polygon offset, which is unstable near the globe limb. Borders never write depth and render only on the camera-facing hemisphere.

The LOD transition enters 1:10m below camera distance `2.15` and returns to 1:50m above `2.45`. This hysteresis is intentional. Geographic triangles must be wound outward and remain front-sided; border fragments are clipped to the camera-facing hemisphere to prevent rear geometry leaking around the limb.

The globe begins with a slow automatic rotation. Any touch, drag, or scroll stops that rotation. Orbit interaction uses low drag and zoom sensitivity, remains damped, and permits precise inspection just above the globe surface without camera clipping.
