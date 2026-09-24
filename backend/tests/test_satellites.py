import json
import tempfile
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.data_layer import satellites
from app.data_layer.satellites import Satellite, fetch_satellites, normalize_omm
from app.main import app


def omm_record(**overrides: object) -> dict[str, object]:
    return {
        "OBJECT_NAME": "ISS (ZARYA)",
        "NORAD_CAT_ID": 25544,
        "EPOCH": "2026-09-23T12:00:00.000Z",
        "MEAN_MOTION": 15.5,
        "ECCENTRICITY": 0.0001,
        "INCLINATION": 51.6,
        "RA_OF_ASC_NODE": 120.0,
        "ARG_OF_PERICENTER": 80.0,
        "MEAN_ANOMALY": 210.0,
        "BSTAR": 0.0002,
        "MEAN_MOTION_DOT": 0.00001,
        "MEAN_MOTION_DDOT": 0.0,
        "EPHEMERIS_TYPE": 0,
        "CLASSIFICATION_TYPE": "U",
        "ELEMENT_SET_NO": 999,
        "REV_AT_EPOCH": 12345,
        **overrides,
    }


class SatelliteNormalizationTests(TestCase):
    def test_normalizes_celestrak_omm_to_typed_domain_record(self) -> None:
        item = normalize_omm(omm_record())
        self.assertEqual(item, Satellite(
            id="25544", noradId=25544, name="ISS (ZARYA)", epoch="2026-09-23T12:00:00Z",
            meanMotion=15.5, eccentricity=0.0001, inclination=51.6, rightAscension=120,
            argOfPericenter=80, meanAnomaly=210, bstar=0.0002, meanMotionDot=0.00001,
            meanMotionDdot=0, ephemerisType=0, classificationType="U", elementSetNo=999,
            revolutionNumber=12345,
        ))

    def test_skips_malformed_or_physically_invalid_records(self) -> None:
        self.assertIsNone(normalize_omm({"OBJECT_NAME": "incomplete"}))
        self.assertIsNone(normalize_omm(omm_record(ECCENTRICITY=1.2)))
        self.assertIsNone(normalize_omm(omm_record(MEAN_MOTION="NaN")))
        self.assertIsNone(normalize_omm(omm_record(EPOCH="not-a-date")))
        self.assertIsNone(normalize_omm(omm_record(EPHEMERIS_TYPE=1)))

    def test_normalizes_naive_celestrak_epoch_as_utc(self) -> None:
        satellite = normalize_omm(omm_record(EPOCH="2026-09-23T12:00:00.000"))
        self.assertIsNotNone(satellite)
        self.assertEqual(satellite.epoch, "2026-09-23T12:00:00Z")


class SatelliteEndpointTests(TestCase):
    def test_returns_normalized_feed_contract(self) -> None:
        feed = satellites.SatelliteFeed(
            category="active", fetchedAt=1_790_000_000_000, stale=False,
            satellites=[normalize_omm(omm_record())],
        )
        with patch("app.main.fetch_satellites", new=AsyncMock(return_value=feed)):
            response = TestClient(app).get("/api/satellites")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        body = response.json()
        self.assertEqual(body["category"], "active")
        self.assertEqual(body["fetchedAt"], 1_790_000_000_000)
        self.assertFalse(body["stale"])
        self.assertEqual(body["satellites"][0]["id"], "25544")
        self.assertEqual(body["satellites"][0]["meanMotion"], 15.5)

    def test_returns_bad_gateway_when_feed_is_unavailable(self) -> None:
        with patch("app.main.fetch_satellites", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
            response = TestClient(app).get("/api/satellites")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Satellite data is temporarily unavailable")


class SatelliteFeedCacheTests(IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.cache_path = Path(self.temp_dir.name) / "satellites_active.json"
        self.patches = [
            patch.object(satellites, "CACHE_PATH", self.cache_path),
            patch.object(satellites, "_cached_feed", None),
            patch.object(satellites, "_next_attempt_at", 0.0),
            patch.object(satellites, "_failure_count", 0),
            patch.object(satellites, "_loaded_from_disk", False),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    async def test_reuses_successful_feed_within_ttl_and_persists_it(self) -> None:
        with patch("app.data_layer.satellites.time.time", return_value=1_800_000_000), \
             patch("app.data_layer.satellites._fetch_upstream", new=AsyncMock(return_value=[normalize_omm(omm_record())])) as fetch:
            first = await fetch_satellites()
            second = await fetch_satellites()
        fetch.assert_awaited_once_with("active")
        self.assertFalse(first.stale)
        self.assertEqual(first, second)
        self.assertTrue(self.cache_path.is_file())

    async def test_loads_persisted_feed_after_module_cache_reset(self) -> None:
        timestamp = 1_800_000_000
        record = normalize_omm(omm_record())
        feed = satellites.SatelliteFeed(fetchedAt=timestamp * 1000, satellites=[record])
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps({
            "feed": feed.model_dump(), "nextAttemptAt": timestamp + 1000, "failureCount": 0,
        }))
        with patch("app.data_layer.satellites.time.time", return_value=timestamp + 1), \
             patch("app.data_layer.satellites._fetch_upstream", new=AsyncMock()) as fetch:
            loaded = await fetch_satellites()
        fetch.assert_not_awaited()
        self.assertEqual(loaded.satellites, [record])

    async def test_serves_stale_feed_on_upstream_failure_and_applies_backoff(self) -> None:
        timestamp = 1_800_000_000
        satellites._cached_feed = satellites.SatelliteFeed(
            fetchedAt=timestamp * 1000 - satellites.SUCCESS_TTL_SECONDS * 1000 - 1,
            satellites=[normalize_omm(omm_record())],
        )
        satellites._loaded_from_disk = True
        with patch("app.data_layer.satellites.time.time", return_value=timestamp), \
             patch("app.data_layer.satellites._fetch_upstream", new=AsyncMock(side_effect=httpx.ConnectError("offline"))) as fetch:
            stale = await fetch_satellites()
            stale_again = await fetch_satellites()
        fetch.assert_awaited_once_with("active")
        self.assertTrue(stale.stale)
        self.assertTrue(stale_again.stale)

    async def test_rejects_cache_older_than_24_hours_after_failure(self) -> None:
        timestamp = 1_800_000_000
        satellites._cached_feed = satellites.SatelliteFeed(
            fetchedAt=(timestamp - satellites.MAX_STALE_SECONDS - 1) * 1000,
            satellites=[normalize_omm(omm_record())],
        )
        satellites._loaded_from_disk = True
        with patch("app.data_layer.satellites.time.time", return_value=timestamp), \
             patch("app.data_layer.satellites._fetch_upstream", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
            with self.assertRaises(httpx.ConnectError):
                await fetch_satellites()

    async def test_persists_failure_backoff_even_without_a_valid_feed(self) -> None:
        timestamp = 1_800_000_000
        with patch("app.data_layer.satellites.time.time", return_value=timestamp), \
             patch("app.data_layer.satellites._fetch_upstream", new=AsyncMock(side_effect=httpx.ConnectError("offline"))) as fetch:
            with self.assertRaises(httpx.ConnectError):
                await fetch_satellites()

            satellites._loaded_from_disk = False
            satellites._cached_feed = None
            with self.assertRaises(httpx.HTTPError):
                await fetch_satellites()
        fetch.assert_awaited_once_with("active")
