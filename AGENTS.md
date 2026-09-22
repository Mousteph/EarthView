# Project Goal

Build a modern real-time 3D Earth visualization displaying publicly available live or near-real-time datasets such as:

- Aircraft
- Satellites
- Ships
- Wildfires
- Earthquakes
- Weather
- Air quality
- Other geospatial datasets

The product should prioritize:
- Modern visual design
- High customizability
- Smooth performance
- Modular data layers
- Clear separation between visualization and data ingestion


# Core Stack

Frontend:
- Next.js
- React
- TypeScript
- React Three Fiber
- Three.js

Backend:
- Python
- FastAPI

Future infrastructure may include:
- Redis
- PostgreSQL
- PostGIS
- WebSockets


# Visualization Principles

The Earth should be a custom graphical globe, not a traditional map.

Do not use photorealistic satellite imagery by default.

Visual direction:
- Minimal
- Modern
- Monochrome Earth
- Data should provide most of the visual color
- Subtle atmosphere/glow effects
- Smooth animations

The visualization must remain highly customizable.


# Architecture

Keep visualization layers independent.

Example:

Earth
├── Countries
├── Atmosphere
├── Grid
├── AircraftLayer
├── SatelliteLayer
├── ShipLayer
├── FireLayer
├── EarthquakeLayer
└── WeatherLayer

Each data layer should:
- receive normalized data
- own its rendering logic
- be independently enabled/disabled
- avoid coupling to external APIs


# Geographic Model

External API formats must not be used directly by visualization components.

Normalize incoming data into internal domain models.

Example:

GeoEntity
- id
- type
- latitude
- longitude
- altitude
- timestamp
- heading
- speed
- metadata

Use a shared geographic conversion utility:

lat/lon/altitude
→ Cartesian coordinates
→ Three.js Vector3


# Performance Rules

Performance is a core requirement.

Avoid:
- one React component per entity
- one Three.js Mesh per entity
- unnecessary React re-renders

Prefer:
- THREE.Points
- InstancedMesh
- BufferGeometry
- GPU attributes
- custom shaders when useful

The architecture should be able to support tens of thousands of simultaneous entities.


# Code Quality

Prefer:
- simple modules
- explicit types
- small components
- clear domain boundaries
- reusable utilities
- well-structured code
- small functions

Avoid:
- over-engineering
- unnecessary abstractions
- deeply nested component trees
- premature optimization outside rendering hot paths
- adding comments that explain what the code does (the code should be self-explanatory)


# Agent Behavior

Before implementing a major feature:
1. inspect the existing architecture
2. preserve established patterns
3. propose the smallest coherent change
4. consider rendering performance
5. avoid introducing dependencies unless they provide clear value

When making architectural changes, explain the reasoning before modifying large parts of the codebase.

# Design Reference

Before changing visual direction, globe treatment, or interaction polish, consult `DESIGN.md`. It defines the implemented EarthView editorial system and the Natural Earth source policy.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
