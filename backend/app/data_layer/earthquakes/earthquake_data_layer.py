from typing import Any, List
from math import isfinite
from urllib.parse import urlparse

import httpx

from .models import Earthquake


class EarthquakeDataLayer:
    """Fetch and normalize earthquake data from the USGS GeoJSON feed."""

    feed_url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson"
    timeout = 10

    @staticmethod
    def normalize(feature: object) -> Earthquake | None:
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
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) for value in (longitude, latitude, depth, magnitude, timestamp)):
            return None
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            return None

        aliases = properties.get("ids")
        source_ids = list(dict.fromkeys([event_id, *(item.strip() for item in aliases.split(",") if item.strip())])) if isinstance(aliases, str) else [event_id]
        source_url = properties.get("url")
        parsed = urlparse(source_url) if isinstance(source_url, str) else None
        source_url = source_url if parsed and parsed.scheme == "https" and parsed.hostname == "earthquake.usgs.gov" else f"https://earthquake.usgs.gov/earthquakes/eventpage/{event_id}"
        updated = properties.get("updated")

        return Earthquake(
            id=event_id,
            place=place,
            lat=float(latitude),
            lon=float(longitude),
            magnitude=float(magnitude),
            location=place,
            time=int(timestamp),
            depth=float(depth),
            sourceIds=source_ids,
            sourceUrl=source_url,
            updatedAt=int(updated) if isinstance(updated, (int, float)) and not isinstance(updated, bool) and isfinite(updated) else None,
        )

    async def fetch(self) -> List[Earthquake]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(self.feed_url)
            response.raise_for_status()
            payload: Any = response.json()

        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            raise ValueError("USGS returned an invalid earthquake feed")

        return [
            earthquake
            for feature in payload["features"]
            if (earthquake := self.normalize(feature)) is not None
        ]
