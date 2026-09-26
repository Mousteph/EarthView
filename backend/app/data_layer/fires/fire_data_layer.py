import asyncio
import csv
import hashlib
import time
from datetime import datetime, timezone
from io import StringIO
from math import isfinite
from pathlib import Path
from typing import Dict, List

import httpx
import yaml

from .models import Fire


class FireDataLayer:
    source = "VIIRS_NOAA20_NRT"
    area_url = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    cache_seconds = 120
    config_path = Path(__file__).resolve().parents[4] / "config.yaml"
    _cache_lock = asyncio.Lock()
    _cached_fires: List[Fire] | None = None
    _cache_expires_at = 0.0

    def __init__(self) -> None:
        map_key = self._read_map_key()
        if not map_key:
            raise RuntimeError("FIRMS map key is not configured in config.yaml")

        self.url = f"{self.area_url}/{map_key}/{self.source}/world/1"

    @classmethod
    def _read_map_key(cls) -> str | None:
        if not cls.config_path.is_file():
            return None

        try:
            with cls.config_path.open(encoding="utf-8") as config_file:
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

    @classmethod
    def normalize(cls, row: Dict[str, str]) -> Fire | None:
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            if not all(isfinite(value) for value in (lat, lon)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                return None

            date = row["acq_date"]
            acquisition_time = row["acq_time"].zfill(4)
            timestamp = int(datetime.strptime(f"{date} {acquisition_time}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc).timestamp() * 1000)
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
            id=f"{cls.source.lower()}-{hashlib.sha1(identity.encode()).hexdigest()[:16]}",
            lat=lat,
            lon=lon,
            time=timestamp,
            confidence=confidence,
            frp=frp,
            satellite=row.get("satellite") or None,
            instrument=row.get("instrument") or None,
        )

    async def fetch(self) -> List[Fire]:
        layer_type = type(self)
        async with layer_type._cache_lock:
            if layer_type._cached_fires is not None and time.monotonic() < layer_type._cache_expires_at:
                return layer_type._cached_fires

            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(self.url)
                response.raise_for_status()

            reader = csv.DictReader(StringIO(response.text))
            required = {"latitude", "longitude", "acq_date", "acq_time"}
            if not reader.fieldnames or not required.issubset(reader.fieldnames):
                raise ValueError("FIRMS returned an invalid fire feed")

            fires = [fire for row in reader if (fire := self.normalize(row)) is not None]
            layer_type._cached_fires = fires
            layer_type._cache_expires_at = time.monotonic() + self.cache_seconds

            return fires
