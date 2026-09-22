# EarthView

A minimal React Three Fiber foundation for a real-time Earth visualization.

## Run locally

```bash
npm install
npm run dev
```

The initial scene is deliberately data-free: ocean, land, country borders, and atmosphere are independent rendering primitives ready for future normalized data layers.

Land and borders come from the official Natural Earth Admin-0 Countries datasets: [1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/) for the global view and [1:10m](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/) for close inspection. The GeoJSON is served locally from `public/data/natural-earth/`; the scene makes no map-tile or satellite-imagery requests.

In development, append `?debug=1` to display renderer statistics. Production builds omit the panel unless `NEXT_PUBLIC_EARTHVIEW_DEBUG=1` is set at build time, and the query flag is still required.
