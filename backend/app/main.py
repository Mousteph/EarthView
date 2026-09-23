import httpx
from fastapi import FastAPI, HTTPException, Response

from .data_layer.earthquakes import Earthquake, fetch_earthquakes
from .data_layer.firms import Fire, fetch_fires

app = FastAPI()


@app.get("/api/earthquakes", response_model=list[Earthquake])
async def get_earthquakes(response: Response) -> list[Earthquake]:
    try:
        earthquakes = await fetch_earthquakes()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail="Earthquake data is temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from error

    response.headers["Cache-Control"] = "no-store"
    return earthquakes


@app.get("/api/fires", response_model=list[Fire])
async def get_fires(response: Response) -> list[Fire]:
    try:
        fires = await fetch_fires()
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
