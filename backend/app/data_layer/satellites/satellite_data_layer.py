import asyncio
import time
from typing import Any, Dict, List

import httpx

from .caches import SatelliteCache
from .models import Satellite, SatelliteFeed
from .normalizer import SatelliteNormalizer
from .source import CelesTrakClient


class SatelliteDataLayer:
    SECONDS_PER_MINUTE = 60
    MINUTES_PER_HOUR = 60
    HOURS_PER_DAY = 24
    GP_REFRESH_INTERVAL_SECONDS = 3 * MINUTES_PER_HOUR * SECONDS_PER_MINUTE # 3 hours
    SATCAT_REFRESH_INTERVAL_SECONDS = HOURS_PER_DAY * SECONDS_PER_MINUTE * SECONDS_PER_MINUTE # 24 hours
    modes = {"active", "debris", "rocket_bodies"}

    def __init__(
        self,
        source: CelesTrakClient | None = None,
        normalizer: SatelliteNormalizer | None = None,
        cache: SatelliteCache | None = None,
    ) -> None:
        self.source = source or CelesTrakClient()
        self.normalizer = normalizer or SatelliteNormalizer()
        self.cache = cache or SatelliteCache()
        self._refresh_lock = asyncio.Lock()


    async def fetch(self, mode: str = "active") -> SatelliteFeed:
        if mode not in self.modes:
            raise ValueError("Unsupported satellite mode")

        async with self._refresh_lock:
            now = self._now_milliseconds()
            cached, last_attempt = self.cache.load_feed(mode)
            if cached and self._is_fresh(cached.fetchedAt, now, self.GP_REFRESH_INTERVAL_SECONDS):
                return self._with_cache_status(cached, False, now)

            if not self._can_refresh(last_attempt, now, self.GP_REFRESH_INTERVAL_SECONDS):
                if cached:
                    return self._with_cache_status(cached, True, now)
                raise httpx.HTTPError("Satellite data is unavailable until the next refresh attempt")

            try:
                records = await self._retrieve_and_normalize_records(mode)
            except (httpx.HTTPError, ValueError):
                self.cache.save_feed(mode, cached, now)
                if cached:
                    return self._with_cache_status(cached, True, now)
                raise

            fetched_at = self._now_milliseconds()
            feed = SatelliteFeed(
                category="active",
                mode=mode,
                fetchedAt=fetched_at,
                metadataStale=self._is_satcat_stale(fetched_at),
                satellites=records,
            )
            self.cache.save_feed(mode, feed, feed.fetchedAt)
            return feed


    async def _retrieve_and_normalize_records(self, mode: str) -> List[Satellite]:
        records = await self.source.fetch_gp_records(mode)
        try:
            metadata = await self._get_satcat_metadata()
        except (httpx.HTTPError, ValueError):
            metadata = {}
        
        if mode == "active":
            satellites = []
            for record in records:
                satcat_record = metadata.get(self._norad_id(record))
                normalized = self.normalizer.normalize_omm(record, satcat_record)
                if normalized is not None:
                    if normalized.operationalStatus is None:
                        normalized = normalized.model_copy(update={"operationalStatus": "active"})
                    satellites.append(normalized)

        else:
            expected_type = "DEB" if mode == "debris" else "R/B"
            
            satellites = []
            for record in records:
                satcat_record = metadata.get(self._norad_id(record))
                if not self._is_current_orbiting_object(satcat_record, expected_type):
                    continue
                
                satellite = self.normalizer.normalize_omm(record, satcat_record)
                if satellite is not None:
                    satellites.append(satellite)

        if not satellites:
            raise ValueError("CelesTrak returned no valid satellite records")

        return satellites


    @staticmethod
    def _norad_id(record: Dict[str, Any]) -> int:
        try:
            return int(record.get("NORAD_CAT_ID", 0))
        except (TypeError, ValueError):
            return 0


    @staticmethod
    def _is_current_orbiting_object(record: Dict[str, Any] | None, expected_type: str) -> bool:
        return bool(
            record
            and record.get("OBJECT_TYPE") == expected_type
            and not record.get("DECAY_DATE")
            and record.get("ORBIT_CENTER") in (None, "", "EA")
            and record.get("ORBIT_TYPE") in (None, "", "ORB")
        )

    
    async def _get_satcat_metadata(self) -> Dict[int, Dict[str, Any]]:
        now = self._now_milliseconds()
        records, fetched_at, last_attempt = self.cache.load_satcat()
        if records and self._is_fresh(fetched_at, now, self.SATCAT_REFRESH_INTERVAL_SECONDS):
            return records

        if not self._can_refresh(last_attempt, now, self.SATCAT_REFRESH_INTERVAL_SECONDS):
            if records:
                return records
            raise httpx.HTTPError("SATCAT metadata is unavailable until the next refresh attempt")

        try:
            records = await self.source.fetch_satcat_records()
        except (httpx.HTTPError, ValueError):
            self.cache.save_satcat(records, fetched_at, now)
            if records:
                return records
            raise

        fetched_at = self._now_milliseconds()
        self.cache.save_satcat(records, fetched_at, fetched_at)
        
        return records


    def _with_cache_status(self, feed: SatelliteFeed, stale: bool, now: int) -> SatelliteFeed:
        return feed.model_copy(update={
            "stale": stale,
            "metadataStale": self._is_satcat_stale(now),
        })


    def _is_satcat_stale(self, now: int) -> bool:
        _, fetched_at, _ = self.cache.load_satcat()
        return not self._is_fresh(fetched_at, now, self.SATCAT_REFRESH_INTERVAL_SECONDS)


    @staticmethod
    def _is_fresh(fetched_at: int, now: int, interval_seconds: int) -> bool:
        interval_milliseconds = interval_seconds * 1000
        return fetched_at > 0 and now - fetched_at < interval_milliseconds


    @staticmethod
    def _can_refresh(last_attempt: int, now: int, interval_seconds: int) -> bool:
        interval_milliseconds = interval_seconds * 1000
        return not last_attempt or now - last_attempt >= interval_milliseconds


    @staticmethod
    def _now_milliseconds() -> int:
        return int(time.time() * 1000)
