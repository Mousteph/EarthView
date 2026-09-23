from typing import Any

import httpx
from pydantic import BaseModel

USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"


class Earthquake(BaseModel):
    id: str
    place: str
    lat: float
    lon: float
    magnitude: float
    location: str
    time: int
    depth: float


def normalize_earthquake(feature: object) -> Earthquake | None:
    if not isinstance(feature, dict):
        return None

    properties = feature.get("properties")
    geometry = feature.get("geometry")
    if not isinstance(properties, dict) or not isinstance(geometry, dict):
        return None

    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 3:
        return None

    event_id = feature.get("id")
    place = properties.get("place")
    magnitude = properties.get("mag")
    timestamp = properties.get("time")
    longitude, latitude, depth = coordinates[:3]

    if not isinstance(event_id, str) or not isinstance(place, str):
        return None
    if isinstance(magnitude, bool) or not isinstance(magnitude, (int, float)):
        return None
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)):
        return None
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in (longitude, latitude, depth)):
        return None

    return Earthquake(
        id=event_id,
        place=place,
        lat=float(latitude),
        lon=float(longitude),
        magnitude=float(magnitude),
        location=place,
        time=int(timestamp),
        depth=float(depth),
    )


async def fetch_earthquakes() -> list[Earthquake]:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(USGS_FEED_URL)
        response.raise_for_status()
        payload: Any = response.json()

    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise ValueError("USGS returned an invalid earthquake feed")

    return [
        earthquake
        for feature in payload["features"]
        if (earthquake := normalize_earthquake(feature)) is not None
    ]
