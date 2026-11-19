import asyncio
import time
from datetime import datetime, timedelta, timezone
from math import isfinite
from typing import Any
from urllib.parse import urlparse, parse_qs

import httpx

from .models import SevereEvent, SevereEventCategory, SevereEventDetails, SevereEventOverlayFeed
from .enrichment import normalize_details, normalize_overlays, safe_link, population_measurements
from .earthquake import normalize_earthquake


class SevereEventDataLayer:
    feed_url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
    lookback = timedelta(days=7)
    cache_seconds = 6 * 60
    page_size = 100
    categories = {
        "EQ": SevereEventCategory(id="earthquakes", title="Earthquakes"),
        "FL": SevereEventCategory(id="floods", title="Floods"),
        "TC": SevereEventCategory(id="cyclones", title="Cyclones"),
        "VO": SevereEventCategory(id="volcanoes", title="Volcanoes"),
        "WF": SevereEventCategory(id="wildfires", title="Wildfires"),
        "DR": SevereEventCategory(id="droughts", title="Droughts"),
    }

    def __init__(self) -> None:
        self._cache: list[SevereEvent] | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()
        self._requests = asyncio.Semaphore(4)
        self._enrichment: dict[tuple, tuple[float, Any]] = {}
        self._enrichment_locks: dict[tuple, asyncio.Lock] = {}
        self._drought_geometry: dict[str, list] = {}

    async def fetch(self) -> list[SevereEvent]:
        if self._cache is not None and time.monotonic() - self._cached_at < self.cache_seconds:
            return self._cache

        async with self._lock:
            if self._cache is not None and time.monotonic() - self._cached_at < self.cache_seconds:
                return self._cache
            now = datetime.now(timezone.utc)
            features: list[Any] = []
            async with self._requests, httpx.AsyncClient(timeout=30) as client:
                for page in range(1, 21):
                    response = await client.get(self.feed_url, params={
                        "eventlist": "EQ;FL;TC;VO;WF",
                        "fromdate": (now - self.lookback).date().isoformat(),
                        "todate": now.date().isoformat(),
                        "alertlevel": "red;orange;green",
                        "pagesize": self.page_size,
                        "pagenumber": page,
                    })
                    response.raise_for_status()
                    payload = response.json()
                    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
                        raise ValueError("GDACS returned an invalid event feed")
                    page_features = payload["features"]
                    features.extend(page_features)
                    if len(page_features) < self.page_size:
                        break
                else:
                    raise ValueError("GDACS event feed exceeded the supported page count")

                drought_response = await client.get(
                    "https://www.gdacs.org/gdacsapi/api/Events/geteventlist/map", params={"eventtype": "DR"})
                drought_response.raise_for_status()
                drought_payload = drought_response.json()
                if not isinstance(drought_payload, dict) or not isinstance(drought_payload.get("features"), list):
                    raise ValueError("GDACS returned an invalid drought feed")
            events = self.normalize_collection({"features": features}, now)
            enriched = {event.id: event for event in await asyncio.gather(*(self._earthquake_metadata(event) for event in events if event.eventType == "EQ"))}
            events = [enriched.get(event.id, event) for event in events]
            droughts = self.normalize_collection(drought_payload, now, ongoing_droughts=True)
            events.extend(droughts)
            self._drought_geometry = {
                event.id: normalize_overlays({"features": [f for f in drought_payload["features"]
                    if isinstance(f, dict) and isinstance(f.get("properties"), dict)
                    and str(f["properties"].get("eventid")) == event.id.split(":")[1]]}, event, self._timestamp)
                for event in droughts
            }
            valid_keys = {(e.id, e.episodeId, e.updatedAt) for e in events}
            self._enrichment = {k: v for k, v in self._enrichment.items() if k[:3] in valid_keys}
            self._enrichment_locks = {k: v for k, v in self._enrichment_locks.items() if k[:3] in valid_keys or v.locked()}
            self._cache = events
            self._cached_at = time.monotonic()
            return events

    @classmethod
    def normalize_collection(cls, payload: Any, now: datetime | None = None, ongoing_droughts: bool = False) -> list[SevereEvent]:
        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            raise ValueError("GDACS returned an invalid event feed")

        now_utc = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
        cutoff_ms = int((now_utc - cls.lookback).timestamp() * 1000)
        now_ms = int(now_utc.timestamp() * 1000)
        latest_by_event: dict[str, SevereEvent] = {}
        for feature in payload["features"]:
            event = cls.normalize_feature(feature)
            if event is None or (ongoing_droughts and event.eventType != "DR") or not ((ongoing_droughts or cutoff_ms <= event.updatedAt) and event.updatedAt <= now_ms):
                continue
            if event.eventType == "EQ" and not cutoff_ms <= event.startedAt <= now_ms:
                continue
            existing = latest_by_event.get(event.id)
            if existing is None or event.updatedAt > existing.updatedAt:
                latest_by_event[event.id] = event

        return sorted(latest_by_event.values(), key=lambda event: event.updatedAt, reverse=True)

    @classmethod
    def normalize_feature(cls, feature: Any) -> SevereEvent | None:
        if not isinstance(feature, dict):
            return None
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict) or geometry.get("type") != "Point":
            return None

        event_type = properties.get("eventtype")
        if not isinstance(event_type, str):
            return None
        if event_type == "FF":
            event_type = "WF"
        category = cls.categories.get(event_type)
        event_id = properties.get("eventid")
        title = properties.get("name")
        position = cls._position(geometry.get("coordinates"))
        started_at = cls._timestamp(properties.get("fromdate"))
        updated_at = cls._timestamp(properties.get("datemodified"))
        if (category is None or isinstance(event_id, bool) or not isinstance(event_id, (str, int))
                or not str(event_id).isascii() or not str(event_id).isdigit()
                or not isinstance(title, str) or not title.strip() or position is None
                or started_at is None or updated_at is None):
            return None
        event_id = str(event_id).lstrip("0") or "0"

        alert = properties.get("alertlevel")
        alert_level = alert.title() if isinstance(alert, str) and alert.lower() in {"green", "orange", "red"} else None
        severity_data = properties.get("severitydata")
        severity = cls._severity(severity_data)
        link_data = properties.get("url")
        link = safe_link(link_data.get("report")) if isinstance(link_data, dict) else None
        country = cls._text(properties.get("country"))
        description = cls._text(properties.get("description"))
        return SevereEvent(
            id=f"{event_type}:{event_id}",
            eventType=event_type,
            episodeId=cls._episode_id(properties.get("episodeid")),
            title=f"Drought · {properties['eventname'].strip()}" if event_type == "DR" and cls._text(properties.get("eventname")) else title.strip().rstrip(", "),
            description=description if description != title.strip() else None,
            link=link,
            categories=[category],
            lon=position[0],
            lat=position[1],
            alertLevel=alert_level,
            severity=severity,
            country=country,
            startedAt=started_at,
            updatedAt=updated_at,
            earthquake=normalize_earthquake(properties) if event_type == "EQ" else None,
        )

    async def _earthquake_metadata(self, event: SevereEvent) -> SevereEvent:
        try:
            payload = await self._cached_request(event, "details", "Events/geteventdata", {"eventtype": "EQ", "eventid": event.id.split(":")[1]})
            latest = self.normalize_feature(payload)
            return latest if latest and latest.id == event.id else event
        except (httpx.HTTPError, ValueError):
            return event  # Optional matching metadata must not hide the summary point.

    api_root = "https://www.gdacs.org/gdacsapi/api"

    @staticmethod
    def _episode_id(value: Any) -> int | None:
        try:
            return int(value) if value is not None and int(value) >= 0 else None
        except (ValueError, TypeError, OverflowError):
            return None

    async def _request(self, path: str, params: dict) -> Any:
        async with self._requests, httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{self.api_root}/{path}", params=params)
            response.raise_for_status()
            return response.json()

    async def _cached_request(self, event: SevereEvent, resource: str, path: str, params: dict) -> Any:
        key = (event.id, event.episodeId, event.updatedAt, resource)
        lock = self._enrichment_locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._enrichment.get(key)
            if cached and time.monotonic() - cached[0] < self.cache_seconds:
                return cached[1]
            payload = await self._request(path, params)
            self._enrichment[key] = (time.monotonic(), payload)
            return payload

    async def _geometry(self, event: SevereEvent) -> list:
        if event.eventType == "DR":
            cached = self._drought_geometry.get(event.id)
            if cached and all(o.episodeId == event.episodeId for o in cached):
                return cached
        payload = await self._cached_request(event, "geometry", "Polygons/getgeometry", {
            "eventtype": event.eventType, "eventid": event.id.split(":")[1], "episodeid": event.episodeId})
        return normalize_overlays(payload, event, self._timestamp)

    async def overlays(self, categories: list[str]) -> SevereEventOverlayFeed:
        events = [e for e in await self.fetch() if e.categories[0].id in categories and e.eventType in {"TC", "DR", "WF"}]
        async def get(event):
            try:
                return [o for o in await self._geometry(event) if o.kind in {"track", "drought-area", "fire-area"}], None
            except (httpx.HTTPError, ValueError):
                return [], event.id
        results = await asyncio.gather(*(get(e) for e in events))
        return SevereEventOverlayFeed(overlays=[o for items, _ in results for o in items],
                                      unavailable=[failure for _, failure in results if failure])

    async def details(self, event_type: str, event_id: int) -> SevereEventDetails:
        event = next((e for e in await self.fetch() if e.id == f"{event_type}:{event_id}"), None)
        if event is None:
            raise LookupError("Event is no longer in the current feed")
        payload = await self._cached_request(event, "details", "Events/geteventdata", {"eventtype": event_type, "eventid": event_id})
        # Details always describe the newest advisory. Use its identity for matching geometry.
        latest = self.normalize_feature(payload)
        if latest and latest.id == event.id:
            event = latest
        details = normalize_details(payload, event, self._timestamp)
        try:
            if event_type == "EQ":
                maps = payload["properties"].get("shakemap", []) or []
                maps = [m for m in maps if isinstance(m, dict) and m.get("shakeid") is not None]
                if maps:
                    shake = next((m for m in maps if str(m.get("last")).lower() == "true"), maps[-1])
                    geometry = await self._cached_request(event, f"shake:{shake['shakeid']}", "Shakemap/getgeometry",
                                                          {"eventid": event_id, "shakeid": shake['shakeid']})
                    details.overlays = normalize_overlays(geometry, event, self._timestamp)
                    for overlay in details.overlays:
                        if overlay.updatedAt is None:
                            overlay.updatedAt = self._timestamp(shake.get("dateinserted"))
            elif event_type != "VO":
                details.overlays = await self._geometry(event)
        except (httpx.HTTPError, ValueError):
            details.geometryUnavailable = True
        if event_type in {"WF", "TC"}:
            resource_key = "impact" if event_type == "WF" else "buffer74"
            for impact in payload["properties"].get("impacts", []) or []:
                resources = impact.get("resource") if isinstance(impact, dict) else None
                resource = resources.get(resource_key) if isinstance(resources, dict) else None
                if not safe_link(resource):
                    continue
                resource_id = parse_qs(urlparse(resource).query).get("id", [""])[0]
                if not resource_id.isdigit():
                    continue
                try:
                    exposure = await self._cached_request(event, f"exposure:{resource_id}", "Export/getimpact", {"id": resource_id})
                    details.measurements.extend(population_measurements(exposure, event_type))
                except (httpx.HTTPError, ValueError):
                    pass  # Optional exposure must not hide event measurements or geometry.
                break
        return details

    @staticmethod
    def _position(value: Any) -> tuple[float, float] | None:
        if not isinstance(value, list) or len(value) < 2:
            return None
        try:
            lon, lat = float(value[0]), float(value[1])
        except (TypeError, ValueError, OverflowError):
            return None
        return (lon, lat) if isfinite(lon) and isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90 else None

    @staticmethod
    def _timestamp(value: Any) -> int | None:
        if not isinstance(value, str) or not value.strip():
            return None
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return int(parsed.timestamp() * 1000)
        except (ValueError, OverflowError):
            return None

    @staticmethod
    def _text(value: Any) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

    @classmethod
    def _severity(cls, value: Any) -> str | None:
        if not isinstance(value, dict):
            return None
        number = value.get("severity")
        if not isinstance(number, (int, float)) or not isfinite(number) or number <= 0:
            return None
        description = cls._text(value.get("severitytext"))
        if description:
            return description
        unit = cls._text(value.get("severityunit"))
        return f"{number:g} {unit}".strip()
