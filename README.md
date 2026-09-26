# EarthView

EarthView displays publicly available data in its geographic context on an interactive 3D globe.

![EarthView interface with earthquake, active-fire, and orbital data loaded and the ISS selected](docs/images/earthview-data-loaded.png)

## What you can explore

| Layer | What it shows |
| --- | --- |
| Earthquakes | Recent earthquake locations, magnitude, depth, and event details. |
| Active fires | Near-real-time fire and thermal hotspot detections. |
| Orbital objects | Active satellites, debris, and rocket bodies, with filters and object details. |
| Geographic context | Country geography and land/seafloor relief shown on the globe. |

## Quick start and configuration

Run the backend and frontend in separate terminals.

### 1. Configure the optional fire feed

Earthquakes and satellites can run without a FIRMS key. To load active fires, request a free [NASA FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/area/), then create a local config file at the repository root:

```bash
cp config.example.yaml config.yaml
```

Put your key in the `firms.map_key` field in `config.yaml`. This file is gitignored. Never commit or share the key. Restart the backend after changing it. Without a key, `/api/fires` returns HTTP 503 and the other feeds remain available.

### 2. Start the API

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API listens on `http://127.0.0.1:8000` by default.

### 3. Start the frontend

In a second terminal, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend rewrites `/api/*` to `http://127.0.0.1:8000`. To use a different backend origin, set `EARTHVIEW_API_ORIGIN` before starting Next.js, for example:

```bash
EARTHVIEW_API_ORIGIN=http://127.0.0.1:8010 npm run dev
```

The data-source page is at [http://localhost:3000/data](http://localhost:3000/data).

## Development commands

Frontend commands run from `frontend/`:

```bash
npm run typecheck
npm run lint
npm run build
node --test tests/*.test.mjs
```

Backend tests run from `backend/` with its virtual environment active:

```bash
python -m unittest discover -s tests
```

Run the frontend in development with `npm run dev`; run the backend with `uvicorn app.main:app --reload`. Append `?debug=1` to the map route for renderer diagnostics. Production builds include the diagnostics panel only when `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` is set at build time, and the query flag is still required.

## Architecture summary

- `frontend/app/` owns the map and data-source routes.
- `frontend/features/` owns normalized feature models, feed hooks, map state, filters, controls, and inspection content.
- `frontend/globe/` owns scene composition, local geography and LOD, relief, the batched point renderer, satellite worker/rendering, and diagnostics.
- `frontend/shared/` contains utilities and UI pieces used across features, including the earthquake/fire array-feed loader.
- `frontend/styles/design-tokens.css` is the canonical source for shared colors and visual values; route and control styles consume those tokens.
- `backend/app/main.py` exposes `/api/earthquakes`, `/api/fires`, and `/api/satellites`; `backend/app/data_layer/` owns provider access, normalization, validation, and caching.

The data path is provider → backend normalization → API response → feature validation and state → typed globe renderer. Earthquakes and fires use the shared array loader; orbital modes retain their own feed lifecycle and specialized worker-backed renderer.

## Data sources

| Provider | Data used | App endpoint or local asset | Freshness, cache, or attribution |
| --- | --- | --- | --- |
| [USGS](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | Past-day earthquake events, including location, magnitude, time, and depth | `/api/earthquakes` (backend reads the USGS `summary/all_day.geojson` feed) | Backend fetches and normalizes the upstream feed per request; no backend cache is configured. |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) | Global VIIRS NOAA-20 near-real-time thermal detections for the current UTC day; includes acquisition time and fire radiative power | `/api/fires` (backend requests the FIRMS Area CSV API) | Requires a local MAP_KEY. Successful responses are cached in process for 120 seconds. |
| [CelesTrak](https://celestrak.org/satcat/satcat-format.php) | GP orbital elements and SATCAT metadata for active satellites, debris, and rocket bodies | `/api/satellites?mode=active`, `?mode=debris`, or `?mode=rocket_bodies` | Browser refreshes enabled modes every 2 hours 5 minutes. Backend caches GP feeds for 3 hours and SATCAT metadata for 24 hours; cached feeds may be returned as stale after an upstream failure. Positions are propagated locally with SGP4. Debris and rocket-body name queries do not cover every cataloged object. |
| [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) | Admin-0 land and country-border geometry | `frontend/public/data/natural-earth/`: 1:50m global and 1:10m close-inspection assets | Bundled and served locally; see Natural Earth's terms for attribution and use. |
| [GEBCO Compilation Group](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2025-grid) | Land and seafloor slope shading derived from GEBCO 2025 Grid | `frontend/public/data/gebco/relief-2048.png` | Derived texture based on GEBCO 2025 Grid; source acknowledgment is required. [Citation](https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29). The grid is not suitable for navigation or safety at sea; GEBCO does not endorse EarthView. |
