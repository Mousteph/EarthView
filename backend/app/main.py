import httpx
from fastapi import FastAPI, HTTPException, Query, Response
from typing import Annotated, List

from .data_layer.earthquakes import Earthquake, EarthquakeDataLayer
from .data_layer.fires import Fire, FireDataLayer
from .data_layer.severe_events import SevereEvent, SevereEventDataLayer
from .data_layer.severe_events.models import SevereEventDetails, SevereEventOverlayFeed
from .data_layer.pipelines import PipelineDataLayer, PipelineFeed
from .data_layer.satellites import SatelliteFeed, SatelliteDataLayer

app = FastAPI()
_earthquake_data_layer = EarthquakeDataLayer()
_fire_data_layer = FireDataLayer()
_severe_event_data_layer = SevereEventDataLayer()
_pipeline_data_layer = PipelineDataLayer()
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


@app.get("/api/severe-events")
async def get_severe_events(response: Response) -> List[SevereEvent]:
    try:
        events = await _severe_event_data_layer.fetch()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail="Severe event data is temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from error

    response.headers["Cache-Control"] = "no-store"
    return events


@app.get("/api/severe-events/overlays")
async def get_severe_event_overlays(response: Response, categories: str = "cyclones,droughts,wildfires") -> SevereEventOverlayFeed:
    selected = categories.split(",") if categories else []
    if any(category not in {"cyclones", "droughts", "wildfires"} for category in selected):
        raise HTTPException(status_code=422, detail="Unsupported overview category")
    try:
        feed = await _severe_event_data_layer.overlays(selected)
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Severe event overlays are temporarily unavailable",
                            headers={"Cache-Control": "no-store"}) from error
    response.headers["Cache-Control"] = "no-store"
    return feed


@app.get("/api/severe-events/{event_type}/{event_id}/details")
async def get_severe_event_details(response: Response, event_type: str, event_id: int) -> SevereEventDetails:
    if event_type not in SevereEventDataLayer.categories:
        raise HTTPException(status_code=422, detail="Unsupported event type")
    try:
        details = await _severe_event_data_layer.details(event_type, event_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error), headers={"Cache-Control": "no-store"}) from error
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Severe event details are temporarily unavailable",
                            headers={"Cache-Control": "no-store"}) from error
    response.headers["Cache-Control"] = "no-store"
    return details


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


@app.get("/api/pipelines/gas")
async def get_gas_pipelines(response: Response) -> PipelineFeed:
    try:
        feed = await _pipeline_data_layer.fetch("gas")
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail="Gas pipeline data is temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from error

    response.headers["Cache-Control"] = "no-store"
    return feed


@app.get("/api/pipelines/oil")
async def get_oil_pipelines(response: Response) -> PipelineFeed:
    try:
        feed = await _pipeline_data_layer.fetch("oil")
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail="Oil pipeline data is temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from error

    response.headers["Cache-Control"] = "no-store"
    return feed
