import csv
import io
from typing import Any, Dict, List

import httpx


class CelesTrakClient:
    gp_url = "https://celestrak.org/NORAD/elements/gp.php"
    satcat_url = "https://celestrak.org/pub/satcat.csv"
    modes = {"satellites": "active", "debris": "DEB", "rocket_bodies": "R/B"}

    async def fetch_gp_records(self, mode: str) -> List[Dict[str, Any]]:
        if mode not in self.modes:
            raise ValueError("Unsupported satellite mode")

        if mode == "satellites":
            params = {"GROUP": "active", "FORMAT": "JSON"}
        else:
            params = {"NAME": self.modes[mode], "FORMAT": "JSON"}

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(self.gp_url, params=params)
            response.raise_for_status()

        payload = response.json()
        if not isinstance(payload, list):
            raise ValueError("CelesTrak returned an invalid satellite feed")
        
        return [record for record in payload if isinstance(record, dict)]


    async def fetch_satcat_records(self) -> Dict[int, Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.get(self.satcat_url)
            response.raise_for_status()

        records: Dict[int, Dict[str, Any]] = {}
        for row in csv.DictReader(io.StringIO(response.text)):
            try:
                records[int(row["NORAD_CAT_ID"])] = row
            except (KeyError, TypeError, ValueError):
                continue
        
        if not records:
            raise ValueError("CelesTrak returned no valid SATCAT records")
        
        return records
