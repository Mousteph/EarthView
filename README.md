# EarthView

A minimal React Three Fiber foundation for a real-time Earth visualization.

## Run locally

```bash
npm install
npm run dev
```

The initial scene is deliberately data-free: ocean, land, country borders, and atmosphere are independent rendering primitives ready for future normalized data layers.

Land and borders come from the official [Natural Earth 1:10m Admin-0 Countries dataset](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/). The GeoJSON is served locally from `public/data/natural-earth/`; the scene makes no map-tile or satellite-imagery requests.
