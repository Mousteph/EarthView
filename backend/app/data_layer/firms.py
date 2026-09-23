import asyncio
import csv
import hashlib
import time
from datetime import datetime, timezone
from io import StringIO
from math import isfinite
from pathlib import Path

import httpx
import yaml
from pydantic import BaseModel

FIRMS_SOURCE = "VIIRS_NOAA20_NRT"
FIRMS_AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
FIRMS_CACHE_SECONDS = 120
_cache_lock = asyncio.Lock()
_cached_fires: list["Fire"] | None = None
_cache_expires_at = 0.0
CONFIG_PATH = Path(__file__).resolve().parents[3] / "config.yaml"


class Fire(BaseModel):
    id: str
    lat: float
    lon: float
    time: int
    confidence: str | None
    frp: float | None
    satellite: str | None
    instrument: str | None


def read_firms_map_key() -> str | None:
    if not CONFIG_PATH.is_file():
        return None

    try:
        with CONFIG_PATH.open(encoding="utf-8") as config_file:
            config = yaml.safe_load(config_file)
    except yaml.YAMLError as error:
        raise RuntimeError("FIRMS configuration in config.yaml is invalid") from error

    if not isinstance(config, dict):
        return None
    firms_config = config.get("firms")
    if not isinstance(firms_config, dict):
        return None
    map_key = firms_config.get("map_key")
    return map_key.strip() if isinstance(map_key, str) and map_key.strip() else None


def normalize_fire(row: dict[str, str]) -> Fire | None:
    try:
        lat = float(row["latitude"])
        lon = float(row["longitude"])
        if not all(isfinite(value) for value in (lat, lon)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        date = row["acq_date"]
        acquisition_time = row["acq_time"].zfill(4)
        timestamp = int(datetime.strptime(f"{date} {acquisition_time}", "%Y-%m-%d %H%M")
                        .replace(tzinfo=timezone.utc).timestamp() * 1000)
    except (KeyError, TypeError, ValueError, OverflowError):
        return None

    confidence = {"l": "Low", "n": "Nominal", "h": "High"}.get(row.get("confidence", "").lower())
    try:
        frp = float(row.get("frp", ""))
        if not isfinite(frp) or frp < 0:
            frp = None
    except (TypeError, ValueError):
        frp = None

    identity = "|".join(row.get(field, "") for field in (
        "latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument", "scan", "track",
    ))
    return Fire(
        id=f"{FIRMS_SOURCE.lower()}-{hashlib.sha1(identity.encode()).hexdigest()[:16]}",
        lat=lat,
        lon=lon,
        time=timestamp,
        confidence=confidence,
        frp=frp,
        satellite=row.get("satellite") or None,
        instrument=row.get("instrument") or None,
    )


async def fetch_fires() -> list[Fire]:
    global _cached_fires, _cache_expires_at
    map_key = read_firms_map_key()
    if not map_key:
        raise RuntimeError("FIRMS map key is not configured in config.yaml")

    async with _cache_lock:
        if _cached_fires is not None and time.monotonic() < _cache_expires_at:
            return _cached_fires

        url = f"{FIRMS_AREA_URL}/{map_key}/{FIRMS_SOURCE}/world/1"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url)
            response.raise_for_status()

        reader = csv.DictReader(StringIO(response.text))
        required = {"latitude", "longitude", "acq_date", "acq_time"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError("FIRMS returned an invalid fire feed")

        fires = [fire for row in reader if (fire := normalize_fire(row)) is not None]
        _cached_fires = fires
        _cache_expires_at = time.monotonic() + FIRMS_CACHE_SECONDS
        return fires
