from typing import Any, Dict

import httpx

from .models import PipelineFuel


class GlobalEnergyMonitorPipelineSource:
    urls: Dict[PipelineFuel, str] = {
        "gas": "https://raw.githubusercontent.com/GlobalEnergyMonitor/goit-ggit-data-ops/map-data/ggit_map_latest.geojson",
        "oil": "https://raw.githubusercontent.com/GlobalEnergyMonitor/goit-ggit-data-ops/map-data/goit_map_latest.geojson",
    }

    async def fetch(self, fuel: PipelineFuel) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(self.urls[fuel])
            response.raise_for_status()
            payload = response.json()

        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
            raise ValueError("GEM returned an invalid pipeline GeoJSON FeatureCollection")
        return payload
