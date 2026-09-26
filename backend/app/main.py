import httpx
from fastapi import FastAPI, HTTPException, Query, Response
from typing import Annotated, List

from .data_layer.earthquakes import Earthquake, EarthquakeDataLayer
from .data_layer.fires import Fire, FireDataLayer
from .data_layer.satellites import SatelliteFeed, SatelliteDataLayer

app = FastAPI()
_earthquake_data_layer = EarthquakeDataLayer()
_fire_data_layer = FireDataLayer()
_satellite_data_layer = SatelliteDataLayer()


@app.get("/api/earthquakes")
async def get_earthquakes(response: Response) -> List[Earthquake]:
    try:
        earthquakes = await _earthquake_data_layer.fetch()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail="Earthquake data is temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from error

    response.headers["Cache-Control"] = "no-store"
    return earthquakes


@app.get("/api/fires",)
async def get_fires(response: Response) -> List[Fire]:
    try:
        fires = await _fire_data_layer.fetch()
    except RuntimeError as error:
        raise HTTPException(
            status_code=503,
            detail="Active fires are not configured",
            headers={"Cache-Control": "no-store"},
        ) from error

    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail="Active fire data is temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from error

    response.headers["Cache-Control"] = "no-store"
    return fires


@app.get("/api/satellites")
async def get_satellites(
    response: Response,
    mode: Annotated[str, Query(pattern="^(active|debris|rocket_bodies)$")] = "active"
) -> SatelliteFeed:
    try:
        feed = await _satellite_data_layer.fetch(mode)
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail="Satellite data is temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from error

    response.headers["Cache-Control"] = "no-store"
    return feed
