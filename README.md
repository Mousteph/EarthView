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

The frontend proxies `/api/*` to `http://127.0.0.1:8000` by default. Set `EARTHVIEW_API_ORIGIN` before starting Next.js to use a different FastAPI origin.

Backend source loading and normalization live in `backend/app/data_layer/`; `backend/app/main.py` exposes the API routes and calls those provider functions.

The globe keeps ocean, land, country borders, and each normalized data layer as independent rendering primitives.

Land and borders come from the official Natural Earth Admin-0 Countries datasets: [1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/) for the global view and [1:10m](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/) for close inspection. The GeoJSON is served locally from `frontend/public/data/natural-earth/`; the scene makes no map-tile or satellite-imagery requests. Shared palette and typography tokens are defined in `frontend/styles/design-tokens.css`.

In development, append `?debug=1` to display renderer statistics. Production builds omit the panel unless `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` is set at build time, and the query flag is still required.
