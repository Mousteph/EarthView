import asyncio
import time
from typing import Dict

import httpx

from .models import PipelineFeed, PipelineFuel
from .normalizer import PipelineNormalizer
from .source import GlobalEnergyMonitorPipelineSource


class PipelineDataLayer:
    CACHE_INTERVAL_SECONDS = 24 * 60 * 60
    DATASETS = {
        "gas": ("Global Gas Infrastructure Tracker", "November 2025", "https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker"),
        "oil": ("Global Oil Infrastructure Tracker", "June 2026", "https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker"),
    }

    def __init__(self, source: GlobalEnergyMonitorPipelineSource | None = None) -> None:
        self.source = source or GlobalEnergyMonitorPipelineSource()
        self._cache: Dict[PipelineFuel, PipelineFeed] = {}
        self._last_attempt: Dict[PipelineFuel, int] = {}
        self._refresh_lock = asyncio.Lock()

    async def fetch(self, fuel: PipelineFuel) -> PipelineFeed:
        now = self._now_milliseconds()
        cached = self._cache.get(fuel)
        if cached and self._is_fresh(cached.fetchedAt, now):
            return cached.model_copy(update={"stale": False})

        async with self._refresh_lock:
            now = self._now_milliseconds()
            cached = self._cache.get(fuel)
            if cached and self._is_fresh(cached.fetchedAt, now):
                return cached.model_copy(update={"stale": False})

            last_attempt = self._last_attempt.get(fuel, 0)
            if last_attempt and self._is_fresh(last_attempt, now):
                if cached:
                    return cached.model_copy(update={"stale": True})
                raise httpx.HTTPError("GEM pipeline data is unavailable until the next refresh attempt")

            self._last_attempt[fuel] = now
            try:
                payload = await self.source.fetch(fuel)
                pipelines = PipelineNormalizer.normalize_collection(payload, fuel)
            except (httpx.HTTPError, ValueError):
                if cached:
                    return cached.model_copy(update={"stale": True})
                raise

            dataset, release, source_url = self.DATASETS[fuel]
            feed = PipelineFeed(
                fuel=fuel,
                dataset=dataset,
                release=release,
                sourceUrl=source_url,
                fetchedAt=self._now_milliseconds(),
                pipelines=pipelines,
            )
            self._cache[fuel] = feed
            return feed

    @classmethod
    def _is_fresh(cls, fetched_at: int, now: int) -> bool:
        return fetched_at > 0 and now - fetched_at < cls.CACHE_INTERVAL_SECONDS * 1000

    @staticmethod
    def _now_milliseconds() -> int:
        return int(time.time() * 1000)
