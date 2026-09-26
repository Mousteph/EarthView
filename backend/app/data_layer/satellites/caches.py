import json
import os
from pathlib import Path
from typing import Any, Dict, Tuple

from .models import SatelliteFeed


class SatelliteCache:
    def __init__(
        self,
        feed_cache_path: Path | None = None,
        satcat_cache_path: Path | None = None,
    ) -> None:
        cache_directory = Path(__file__).resolve().parents[3] / ".cache"
        self.feed_cache_path = feed_cache_path or cache_directory / "satellites_active.json"
        self.satcat_cache_path = satcat_cache_path or cache_directory / "satcat.json"


    def feed_cache_path_for(self, mode: str) -> Path:
        if mode == "satellites":
            return self.feed_cache_path

        return self.feed_cache_path.with_name(f"satellites_{mode}.json")


    def load_feed(self, mode: str) -> Tuple[SatelliteFeed | None, int]:
        try:
            payload = json.loads(self.feed_cache_path_for(mode).read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                return None, 0

            feed_payload = payload.get("feed")
            feed = SatelliteFeed.model_validate(feed_payload) if feed_payload is not None else None
            if feed is not None and feed.mode != mode:
                return None, 0

            return feed, int(payload.get("lastAttemptAt", 0))
        except (OSError, ValueError, TypeError, KeyError):
            return None, 0


    def save_feed(self, mode: str, feed: SatelliteFeed | None, last_attempt_at: int) -> None:
        self._write_json(
            self.feed_cache_path_for(mode),
            {
                "feed": feed.model_dump() if feed else None,
                "lastAttemptAt": last_attempt_at,
            },
        )


    def load_satcat(self) -> Tuple[Dict[int, Dict[str, Any]], int, int]:
        try:
            payload = json.loads(self.satcat_cache_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                return {}, 0, 0

            records = {int(key): value for key, value in payload.get("records", {}).items()}
            return records, int(payload.get("fetchedAt", 0)), int(payload.get("lastAttemptAt", 0))

        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            return {}, 0, 0


    def save_satcat(
        self,
        records: Dict[int, Dict[str, Any]],
        fetched_at: int,
        last_attempt_at: int,
    ) -> None:
        self._write_json(
            self.satcat_cache_path,
            {
                "fetchedAt": fetched_at,
                "lastAttemptAt": last_attempt_at,
                "records": records,
            },
        )

    @staticmethod
    def _write_json(path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload), encoding="utf-8")

        os.replace(temporary, path)
