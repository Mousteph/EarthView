# EarthView project guide

EarthView is an editorial 3D globe for exploring earthquake, active-fire, and orbital-object data. The frontend is Next.js, React, TypeScript, React Three Fiber, and Three.js; the API is Python and FastAPI. Keep the globe custom and restrained: no map tiles or photorealistic satellite imagery.

## What exists today

- Map route with independently controlled earthquakes, active fires, and satellite/debris/rocket-body modes.
- Data route at `/data` describing the live feeds and local geography/relief assets.
- FastAPI endpoints for earthquakes, fires, and satellites. Aircraft, ships, weather, air quality, and other future layers are not implemented; do not describe them as working features.
- Locally bundled Natural Earth country geometry and a derived GEBCO relief texture.

## Repository ownership

```text
frontend/app/             Next.js routes and global CSS entry point
frontend/features/        Feature models, feed hooks, map state and UI composition
frontend/globe/           Three.js scene, geography, relief, points, orbital rendering and debug
frontend/shared/          Shared feed loader, formatting, UI primitives, geo models and token bridge
frontend/styles/          Design tokens and route/control styles
backend/app/main.py       FastAPI routes and endpoint error handling
backend/app/data_layer/   Provider clients, normalization, validation and caches
backend/tests/            Python API and provider tests
```

Read the [frontend guide](frontend/AGENTS.md) for frontend ownership and workflow, the [backend guide](backend/AGENTS.md) before changing API/data code, and [DESIGN.md](DESIGN.md) before changing visual treatment. The [README](README.md) is the setup and data-source reference.

## Data and rendering boundaries

Provider flow is `external provider → backend data layer → normalized API response → frontend feature model validation/hook → typed scene props → globe renderer`. Backend provider formats stay out of globe components. Earthquake and fire hooks share the small array-feed loader in `frontend/shared/data/`; orbital feeds retain their own cache, mode, refresh, and validation behavior.

`frontend/features/map/` owns enabled layers, orbital filters, and selection. A selection stays open only while its item exists, its layer/mode is enabled, and it passes the active visibility filter. `frontend/globe/GlobeScene.tsx` composes the Earth, geographic layers, batched point layers, and the specialized satellite renderer. The satellite worker protocol and animation scheduling are explicit contracts; preserve them when changing their implementation.

Use `frontend/globe/geo.ts` for geographic conversion to Three.js vectors. Pass normalized typed feature data into renderers; feature hooks must not import globe components. Avoid a universal layer registry unless real implementations demonstrate a need for one.

## Data freshness and cache facts

- Earthquakes come from the USGS past-day GeoJSON feed; the backend fetches and normalizes it per request.
- Fires come from NASA FIRMS VIIRS NOAA-20 for the current UTC day; the in-process backend cache is 120 seconds and a local `config.yaml` FIRMS key is required.
- Satellite GP feeds are cached by backend mode for three hours; SATCAT metadata is cached for 24 hours. The browser requests enabled modes on a two-hour-five-minute cadence and also supports manual refresh. These are separate policies; do not conflate them.
- Natural Earth 1:50m/1:10m GeoJSON and the GEBCO-derived relief PNG are served locally.

Keep API endpoints and response shapes compatible unless a separately scoped API change is requested. Do not log or expose credentials. `config.yaml` is local/ignored; use `config.example.yaml` as the template.

## Commands

Frontend commands run from `frontend/`:

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm run build
node --test tests/*.test.mjs
```

Backend setup and checks run from `backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
python -m unittest discover -s tests
```

The frontend rewrites `/api/*` to `http://127.0.0.1:8000` by default. Set `EARTHVIEW_API_ORIGIN` before starting Next.js to use another API origin. Keep the frontend and backend processes in separate terminals.

From the repository root, Docker Compose can run the production containers or a development setup with mounted source files:

```bash
docker compose up --build
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Both modes expect the ignored root `config.yaml`; the API container mounts it read-only and persists satellite cache files in a named volume.

## Design and implementation rules

- Preserve the implemented editorial globe, colors, typography, panel/control placement, responsive behavior, and motion in [DESIGN.md](DESIGN.md).
- `frontend/styles/design-tokens.css` is the canonical source for fixed colors and shared visual values. Three.js colors go through `frontend/shared/designTokens.ts` so client-only CSS reads happen after mount.
- Batch static points; do not add one React component or Three.js mesh per data entity.
- Prefer small explicit modules and typed domain boundaries over speculative frameworks. Avoid adding dependencies without a concrete need.
- For significant architecture changes, first map current ownership and propose the smallest coherent change. Keep file moves separate from behavior/performance changes and measure performance claims.

## Model routing

Optimize for quality while minimizing token cost.

* Use **GPT6 Luna by default** for well-scoped implementation tasks, repetitive edits, simple refactors, tests, documentation, UI adjustments, and changes that follow an existing pattern.
* Escalate to **GPT6 Sol** only when the task requires architecture decisions, significant cross-file reasoning, ambiguous requirements, difficult debugging, performance-sensitive changes, complex integration, or a final review of important work.
* Do not use GPT6 Sol for work that GPT6 Luna can complete reliably.
* When possible, use **GPT6 Sol to plan or review** and **GPT6 Luna to execute** the clearly defined subtasks.
* If GPT6 Luna becomes uncertain, starts making broad assumptions, or fails repeatedly, escalate that specific task to GPT6 Sol rather than restarting the entire workflow with GPT6 Sol.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
