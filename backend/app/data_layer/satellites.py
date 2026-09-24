import asyncio
import json
import os
import time
from datetime import datetime, timezone
from math import isfinite
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel

CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"
SUCCESS_TTL_SECONDS = 2 * 60 * 60 + 5 * 60
MAX_STALE_SECONDS = 24 * 60 * 60
INITIAL_FAILURE_BACKOFF_SECONDS = 15 * 60
MAX_FAILURE_BACKOFF_SECONDS = 6 * 60 * 60
CATEGORY_GROUPS = {"active": "active"}
CACHE_PATH = Path(__file__).resolve().parents[2] / ".cache" / "satellites_active.json"


class Satellite(BaseModel):
    id: str
    noradId: int
    name: str
    epoch: str
    meanMotion: float
    eccentricity: float
    inclination: float
    rightAscension: float
    argOfPericenter: float
    meanAnomaly: float
    bstar: float
    meanMotionDot: float
    meanMotionDdot: float
    ephemerisType: int
    classificationType: str
    elementSetNo: int
    revolutionNumber: int


class SatelliteFeed(BaseModel):
    category: str = "active"
    fetchedAt: int
    stale: bool = False
    satellites: list[Satellite]


_cache_lock = asyncio.Lock()
_cached_feed: SatelliteFeed | None = None
_next_attempt_at = 0.0
_failure_count = 0
_loaded_from_disk = False


def normalize_omm(record: dict[str, Any]) -> Satellite | None:
    try:
        norad_id = int(record["NORAD_CAT_ID"])
        name = record["OBJECT_NAME"].strip()
        epoch = record["EPOCH"]
        if not isinstance(epoch, str):
            return None
        parsed_epoch = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
        if parsed_epoch.tzinfo is not None:
            parsed_epoch = parsed_epoch.astimezone(timezone.utc)
        if parsed_epoch.year < 1957:
            return None
        epoch = parsed_epoch.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        numeric = {
            "meanMotion": float(record["MEAN_MOTION"]),
            "eccentricity": float(record["ECCENTRICITY"]),
            "inclination": float(record["INCLINATION"]),
            "rightAscension": float(record["RA_OF_ASC_NODE"]),
            "argOfPericenter": float(record["ARG_OF_PERICENTER"]),
            "meanAnomaly": float(record["MEAN_ANOMALY"]),
            "bstar": float(record["BSTAR"]),
            "meanMotionDot": float(record["MEAN_MOTION_DOT"]),
            "meanMotionDdot": float(record["MEAN_MOTION_DDOT"]),
        }
        ephemeris_type = int(record.get("EPHEMERIS_TYPE", 0))
        element_set_no = int(record.get("ELEMENT_SET_NO", 0))
        revolution_number = int(record.get("REV_AT_EPOCH", 0))
        classification = str(record.get("CLASSIFICATION_TYPE", "U")).strip() or "U"
    except (KeyError, TypeError, ValueError, OverflowError, AttributeError):
        return None

    if norad_id <= 0 or not name:
        return None
    if not all(isfinite(value) for value in numeric.values()):
        return None
    if numeric["meanMotion"] <= 0 or not 0 <= numeric["eccentricity"] < 1:
        return None
    if not 0 <= numeric["inclination"] <= 180:
        return None
    if any(not 0 <= numeric[field] <= 360 for field in ("rightAscension", "argOfPericenter", "meanAnomaly")):
        return None
    if ephemeris_type != 0:
        return None

    return Satellite(
        id=str(norad_id),
        noradId=norad_id,
        name=name,
        epoch=epoch,
        **numeric,
        ephemerisType=ephemeris_type,
        classificationType=classification,
        elementSetNo=element_set_no,
        revolutionNumber=revolution_number,
    )


def _read_cache() -> tuple[SatelliteFeed | None, float, int]:
    if not CACHE_PATH.is_file():
        return None, 0.0, 0
    try:
        payload = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        feed_payload = payload.get("feed")
        feed = SatelliteFeed.model_validate(feed_payload) if feed_payload is not None else None
        if feed is not None and feed.category != "active":
            return None, 0.0, 0
        return feed, float(payload.get("nextAttemptAt", 0)), int(payload.get("failureCount", 0))
    except (OSError, ValueError, TypeError, KeyError):
        return None, 0.0, 0


def _write_cache(feed: SatelliteFeed | None, next_attempt_at: float = 0.0, failure_count: int = 0) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = CACHE_PATH.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps({
            "feed": feed.model_dump() if feed is not None else None,
            "nextAttemptAt": next_attempt_at,
            "failureCount": failure_count,
        }),
        encoding="utf-8",
    )
    os.replace(temporary_path, CACHE_PATH)


def _copy_feed(feed: SatelliteFeed, *, stale: bool) -> SatelliteFeed:
    return feed.model_copy(update={"stale": stale})


async def _fetch_upstream(category: str) -> list[Satellite]:
    group = CATEGORY_GROUPS.get(category)
    if group is None:
        raise ValueError("Unsupported satellite category")
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.get(CELESTRAK_GP_URL, params={"GROUP": group, "FORMAT": "JSON"})
        response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("CelesTrak returned an invalid satellite feed")
    satellites = [normalized for item in payload if isinstance(item, dict)
                  if (normalized := normalize_omm(item)) is not None]
    if not satellites:
        raise ValueError("CelesTrak returned no valid satellite records")
    return satellites


async def fetch_satellites(category: str = "active") -> SatelliteFeed:
    global _cached_feed, _next_attempt_at, _failure_count, _loaded_from_disk

    if category not in CATEGORY_GROUPS:
        raise ValueError("Unsupported satellite category")

    async with _cache_lock:
        now = time.time()
        if not _loaded_from_disk:
            disk_feed, disk_next_attempt, disk_failure_count = _read_cache()
            _cached_feed = disk_feed
            _next_attempt_at = disk_next_attempt
            _failure_count = disk_failure_count
            _loaded_from_disk = True

        if _cached_feed is not None and now - _cached_feed.fetchedAt / 1000 < SUCCESS_TTL_SECONDS:
            return _copy_feed(_cached_feed, stale=False)

        if now < _next_attempt_at:
            if _cached_feed is None:
                raise httpx.HTTPError("Satellite data refresh is backing off")
            if now - _cached_feed.fetchedAt / 1000 <= MAX_STALE_SECONDS:
                return _copy_feed(_cached_feed, stale=True)
            raise httpx.HTTPError("Satellite data cache has expired")

        try:
            satellites = await _fetch_upstream(category)
        except (httpx.HTTPError, ValueError) as error:
            _failure_count += 1
            backoff = min(
                INITIAL_FAILURE_BACKOFF_SECONDS * 2 ** (_failure_count - 1),
                MAX_FAILURE_BACKOFF_SECONDS,
            )
            _next_attempt_at = now + backoff
            _write_cache(_cached_feed, _next_attempt_at, _failure_count)
            if _cached_feed is not None and now - _cached_feed.fetchedAt / 1000 <= MAX_STALE_SECONDS:
                return _copy_feed(_cached_feed, stale=True)
            raise error

        fetched_at = int(time.time() * 1000)
        _cached_feed = SatelliteFeed(
            category=category,
            fetchedAt=fetched_at,
            stale=False,
            satellites=satellites,
        )
        _failure_count = 0
        _next_attempt_at = fetched_at / 1000 + SUCCESS_TTL_SECONDS
        _write_cache(_cached_feed, _next_attempt_at, _failure_count)
        return _cached_feed
