# EarthView

A minimal React Three Fiber foundation for a real-time Earth visualization. The Next.js application lives in `frontend/`; the repository root is reserved for shared project documentation and future services such as the FastAPI backend.

## Run the frontend locally

```bash
cd frontend
npm install
npm run dev
```

## Run the data API locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Active Fires uses NASA FIRMS's global VIIRS NOAA-20 near-real-time Area API for the current UTC day. Request a free [FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/area/), then put the key in `firms.map_key` in `config.yaml` (copy `config.example.yaml` first if the local file is missing). The local `config.yaml` is gitignored; only the template is tracked. Restart the backend after changing it. Without a key, `/api/fires` returns 503. The backend reuses successful FIRMS responses for two minutes. The detection time is the satellite acquisition time, and source FRP is reported in megawatts.

The orbital layer uses CelesTrak GP elements and SATCAT metadata for active satellites and available debris and rocket bodies. FastAPI caches GP elements per mode for at least 2 hours and 5 minutes, and SATCAT for 24 hours. The browser propagates positions with SGP4 in a worker and interpolates five-second snapshots. Enable Satellites on the map, choose a mode, and select an object for its live position and orbit. Satellite mission and constellation labels are inferred where possible; the debris and rocket-body name queries do not cover every cataloged object.

The frontend proxies `/api/*` to `http://127.0.0.1:8000` by default. Set `EARTHVIEW_API_ORIGIN` before starting Next.js to use a different FastAPI origin.

Backend source loading and normalization live in `backend/app/data_layer/`; `backend/app/main.py` exposes the API routes and calls those provider functions.

The globe keeps ocean, land, country borders, and each normalized data layer as independent rendering primitives.

## Frontend structure

`frontend/app/` contains the routes. `frontend/features/map/` composes the map, controls, and selection; the earthquake, fire, and orbital folders own their API models, feeds, filters, and inspection content. `frontend/globe/` owns Three.js rendering, geography, relief, workers, and debug tools. `frontend/shared/` holds the small feed and UI pieces used by multiple features. CSS is split by tokens, layout, controls, and the data page in `frontend/styles/`.

Land and borders come from the official Natural Earth Admin-0 Countries datasets: [1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/) for the global view and [1:10m](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/) for close inspection. The GeoJSON is served locally from `frontend/public/data/natural-earth/`; the scene makes no map-tile or satellite-imagery requests. Shared palette and typography tokens are defined in `frontend/styles/design-tokens.css`.

## Relief data

The globe's land and seafloor shading is derived from the [GEBCO 2025 Grid](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2025-grid), mirrored as a [cloud optimized GeoTIFF by the Australian Antarctic Division](https://source.coop/ausantarctic/gebco). The browser receives only `frontend/public/data/gebco/relief-2048.png` (2048 × 1024, about 2.4 MB compressed and 8 MiB of base GPU texture data). The source DEM is not bundled or requested at runtime. The image stores east and north slopes for land in red/green and for the seafloor in blue/alpha. It has no elevation colors and does not displace the globe. Ocean slopes are blurred more strongly than land slopes to suppress small-scale noise. `frontend/globe/relief/relief.ts` holds the independent land, bathymetry, and lighting strengths.

To rebuild the texture, install `numpy`, `scipy`, `Pillow`, and `rasterio` in a Python environment, then run `python scripts/build_relief.py` from the repository root with network access. The script reads GEBCO's downsampled COG overviews and never downloads the multi-gigabyte source file. Output is deterministic for the same source grid and library resampling behavior.

Attribution: **GEBCO Compilation Group (2025) GEBCO 2025 Grid**, [doi:10.5285/37c52e96-24ea-67ce-e063-7086abc05f29](https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29). GEBCO places the grid in the public domain and permits adaptation and commercial use, while requiring source acknowledgement and no implication of GEBCO endorsement. Its data are not suitable for navigation or safety at sea. The app includes the attribution on its `/data` references page, linked from the map summary; preserve it in any redistribution.

In development, append `?debug=1` to display renderer statistics. Production builds omit the panel unless `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` is set at build time, and the query flag is still required.
