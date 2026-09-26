import json
import tempfile
from pathlib import Path
from typing import Dict
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.data_layer.satellites import Satellite, SatelliteFeed
from app.data_layer.satellites.caches import SatelliteCache
from app.data_layer.satellites.normalizer import SatelliteNormalizer
from app.data_layer.satellites.satellite_data_layer import SatelliteDataLayer
from app.data_layer.satellites.source import CelesTrakClient
from app.main import app


def omm_record(**overrides: object) -> Dict[str, object]:
    return {
        "OBJECT_NAME": "ISS (ZARYA)", "NORAD_CAT_ID": 25544, "EPOCH": "2026-09-23T12:00:00.000Z",
        "MEAN_MOTION": 15.5, "ECCENTRICITY": 0.0001, "INCLINATION": 51.6,
        "RA_OF_ASC_NODE": 120.0, "ARG_OF_PERICENTER": 80.0, "MEAN_ANOMALY": 210.0,
        "BSTAR": 0.0002, "MEAN_MOTION_DOT": 0.00001, "MEAN_MOTION_DDOT": 0.0,
        "EPHEMERIS_TYPE": 0, "CLASSIFICATION_TYPE": "U", "ELEMENT_SET_NO": 999, "REV_AT_EPOCH": 12345,
        **overrides,
    }


class SatelliteNormalizationTests(TestCase):
    def setUp(self) -> None:
        self.normalizer = SatelliteNormalizer()

    def test_normalizes_gp_and_joined_satcat_metadata(self) -> None:
        satellite = self.normalizer.normalize_omm(omm_record(), {
            "OBJECT_TYPE": "PAY", "OWNER": "US", "LAUNCH_DATE": "1998-11-20",
            "LAUNCH_SITE": "AFETR", "OBJECT_ID": "1998-067A", "APOGEE": "420", "PERIGEE": "418",
            "OPS_STATUS_CODE": "+",
        })
        self.assertEqual(satellite.id, "25544")
        self.assertEqual(satellite.owner, "United States")
        self.assertEqual(satellite.launchSite, "Air Force Eastern Test Range, Florida, USA")
        self.assertEqual(satellite.internationalDesignator, "1998-067A")
        self.assertEqual(satellite.objectType, "Payload")
        self.assertEqual(satellite.operationalStatus, "active")
        self.assertEqual(satellite.orbitClass, "Low Earth Orbit")
        self.assertFalse(satellite.apsidesEstimated)
        self.assertAlmostEqual(satellite.orbitalPeriodMinutes, 1440 / 15.5)
        self.assertEqual(satellite.missionType, "Space Stations")

    def test_skips_malformed_records_and_uses_nullable_metadata(self) -> None:
        self.assertIsNone(self.normalizer.normalize_omm({"OBJECT_NAME": "incomplete"}))
        self.assertIsNone(self.normalizer.normalize_omm(omm_record(ECCENTRICITY=1.2)))
        item = self.normalizer.normalize_omm(omm_record(OBJECT_NAME="UNKNOWN OBJECT"))
        self.assertIsNone(item.owner)
        self.assertEqual(item.missionType, "Other / Unclassified")
        self.assertTrue(item.apsidesEstimated)
        self.assertIsNone(item.operationalStatus)
        self.assertGreater(item.apogeeKm, 200)
        self.assertLess(item.apogeeKm, 600)
        self.assertEqual(item.epoch, "2026-09-23T12:00:00Z")

    def test_maps_satcat_operational_status_and_classifies_missions_and_orbits(self) -> None:
        for code in ("+", "P", "B", "S", "X"):
            self.assertEqual(self.normalizer.normalize_omm(omm_record(), {"OPS_STATUS_CODE": code}).operationalStatus, "active")
        for code in ("-", "D"):
            self.assertEqual(self.normalizer.normalize_omm(omm_record(), {"OPS_STATUS_CODE": code}).operationalStatus, "inactive")
        for code in ("?", "", "UNKNOWN"):
            self.assertIsNone(self.normalizer.normalize_omm(omm_record(), {"OPS_STATUS_CODE": code}).operationalStatus)
        self.assertEqual(self.normalizer.infer_mission("STARLINK-1000"), ("Communications", "STARLINK"))
        self.assertEqual(self.normalizer.infer_mission("GALILEO-FOC FM1"), ("Navigation", "GALILEO"))
        self.assertEqual(self.normalizer.infer_mission("LANDSAT 9"), ("Earth Observation", None))
        self.assertEqual(self.normalizer.infer_mission("MYSTERY"), ("Other / Unclassified", None))
        self.assertEqual(self.normalizer.orbit_class(800, 700), "Low Earth Orbit")
        self.assertEqual(self.normalizer.orbit_class(20_500, 20_000), "Medium Earth Orbit")
        self.assertEqual(self.normalizer.orbit_class(35_900, 35_700), "Geosynchronous Orbit")
        self.assertEqual(self.normalizer.orbit_class(50_000, 500), "Highly Elliptical Orbit")
        self.assertEqual(self.normalizer.orbit_class(45_000, 40_000), "High Earth Orbit")


class SatelliteEndpointTests(TestCase):
    def test_preserves_feed_contract_and_all_modes(self) -> None:
        feed = SatelliteFeed(
            category="active", mode="satellites", fetchedAt=1_790_000_000_000,
            satellites=[SatelliteNormalizer.normalize_omm(omm_record())],
        )
        with patch.object(SatelliteDataLayer, "fetch", new=AsyncMock(return_value=feed)) as fetch:
            response = TestClient(app).get("/api/satellites")
        fetch.assert_awaited_once_with("satellites")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json()["mode"], "satellites")
        self.assertEqual(response.json()["satellites"][0]["meanMotion"], 15.5)

        for mode in ("satellites", "debris", "rocket_bodies"):
            feed = SatelliteFeed(mode=mode, fetchedAt=1_790_000_000_000, satellites=[])
            with patch.object(SatelliteDataLayer, "fetch", new=AsyncMock(return_value=feed)) as fetch:
                response = TestClient(app).get("/api/satellites", params={"mode": mode})
            fetch.assert_awaited_once_with(mode)
            self.assertEqual(response.status_code, 200)
        self.assertEqual(TestClient(app).get("/api/satellites", params={"mode": "invalid"}).status_code, 422)

    def test_returns_bad_gateway_when_feed_is_unavailable(self) -> None:
        with patch.object(SatelliteDataLayer, "fetch", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
            response = TestClient(app).get("/api/satellites")
        self.assertEqual(response.status_code, 502)


class SatelliteCacheTests(IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.feed_path = root / "satellites_active.json"
        self.satcat_path = root / "satcat.json"
        self.cache = SatelliteCache(self.feed_path, self.satcat_path)
        self.source = CelesTrakClient()
        self.layer = SatelliteDataLayer(source=self.source, cache=self.cache)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    async def test_caches_modes_independently_and_persists(self) -> None:
        catalog = {25544: {"OBJECT_TYPE": "DEB", "ORBIT_CENTER": "EA", "ORBIT_TYPE": "ORB"}}
        with patch("app.data_layer.satellites.satellite_data_layer.time.time", return_value=1_800_000_000), \
             patch.object(self.source, "fetch_gp_records", new=AsyncMock(return_value=[omm_record()])) as fetch_gp, \
             patch.object(self.source, "fetch_satcat_records", new=AsyncMock(return_value=catalog)):
            await self.layer.fetch("satellites")
            await self.layer.fetch("satellites")
            await self.layer.fetch("debris")
        self.assertEqual(fetch_gp.await_count, 2)
        self.assertTrue(self.feed_path.is_file())
        self.assertTrue(self.feed_path.with_name("satellites_debris.json").is_file())

    async def test_loads_persisted_feed_without_network_request(self) -> None:
        timestamp = 1_800_000_000
        feed = SatelliteFeed(fetchedAt=timestamp * 1000, satellites=[SatelliteNormalizer.normalize_omm(omm_record())])
        self.feed_path.write_text(json.dumps({"feed": feed.model_dump(), "nextAttemptAt": timestamp + 1000, "failureCount": 0}))
        with patch("app.data_layer.satellites.satellite_data_layer.time.time", return_value=timestamp + 1), \
             patch.object(self.source, "fetch_gp_records", new=AsyncMock()) as fetch:
            loaded = await self.layer.fetch()
        fetch.assert_not_awaited()
        self.assertEqual(loaded.satellites, feed.satellites)

    async def test_loads_legacy_feed_file_and_ignores_retry_fields(self) -> None:
        timestamp = 1_800_000_000
        record = SatelliteNormalizer.normalize_omm(omm_record()).model_dump()
        for key in ("missionType", "orbitClass", "orbitalPeriodMinutes", "orbitsPerDay", "apogeeKm", "perigeeKm"):
            record.pop(key)
        self.feed_path.write_text(json.dumps({
            "feed": {"category": "active", "fetchedAt": timestamp * 1000, "satellites": [record]},
            "nextAttemptAt": timestamp + 1000,
        }))
        with patch("app.data_layer.satellites.satellite_data_layer.time.time", return_value=timestamp + 1), \
             patch.object(self.source, "fetch_gp_records", new=AsyncMock()) as fetch:
            loaded = await self.layer.fetch()
        fetch.assert_not_awaited()
        self.assertIsNone(loaded.satellites[0].missionType)
        self.assertIsNone(loaded.satellites[0].orbitClass)

    async def test_refreshes_stale_feed_when_requested(self) -> None:
        timestamp = 1_800_000_000
        stale_feed = SatelliteFeed(
            fetchedAt=(timestamp - self.layer.GP_REFRESH_INTERVAL_SECONDS - 1) * 1000,
            satellites=[SatelliteNormalizer.normalize_omm(omm_record())],
        )
        self.cache.save_feed("satellites", stale_feed, 0)
        fetch_gp = AsyncMock(return_value=[omm_record()])
        with patch("app.data_layer.satellites.satellite_data_layer.time.time", return_value=timestamp), \
             patch.object(self.source, "fetch_gp_records", new=fetch_gp), \
             patch.object(self.source, "fetch_satcat_records", new=AsyncMock(return_value={})):
            refreshed = await self.layer.fetch()
        fetch_gp.assert_awaited_once_with("satellites")
        self.assertFalse(refreshed.stale)
        self.assertEqual(refreshed.fetchedAt, timestamp * 1000)

    async def test_serves_feed_of_any_age_and_throttles_failed_refreshes(self) -> None:
        timestamp = 1_800_000_000
        feed = SatelliteFeed(
            fetchedAt=(timestamp - self.layer.GP_REFRESH_INTERVAL_SECONDS - 1) * 1000,
            satellites=[SatelliteNormalizer.normalize_omm(omm_record())],
        )
        self.cache.save_feed("satellites", feed, 0)
        fetch_gp = AsyncMock(side_effect=httpx.ConnectError("offline"))
        with patch("app.data_layer.satellites.satellite_data_layer.time.time", return_value=timestamp), \
             patch.object(self.source, "fetch_gp_records", new=fetch_gp):
            self.assertTrue((await self.layer.fetch()).stale)
            self.assertTrue((await self.layer.fetch()).stale)
        fetch_gp.assert_awaited_once()

    async def test_satcat_returns_stale_data_without_repeated_attempts_during_cooldown(self) -> None:
        now = 1_800_000_000
        stale_records = {25544: {"OBJECT_TYPE": "PAY"}}
        fetched_at = (now - 8 * 86_400) * 1000
        self.cache.save_satcat(stale_records, fetched_at, fetched_at)
        with patch("app.data_layer.satellites.satellite_data_layer.time.time", return_value=now), \
             patch.object(self.source, "fetch_satcat_records", new=AsyncMock(side_effect=httpx.ConnectError("offline"))) as fetch:
            self.assertEqual(await self.layer._get_satcat_metadata(), stale_records)
            self.assertEqual(await self.layer._get_satcat_metadata(), stale_records)
            fetch.assert_awaited_once()

    def test_loads_legacy_satcat_file_and_ignores_retry_fields(self) -> None:
        timestamp = 1_800_000_000
        records = {25544: {"OBJECT_TYPE": "PAY"}}
        self.satcat_path.write_text(json.dumps({
            "fetchedAt": timestamp * 1000,
            "nextAttemptAt": timestamp + 1000,
            "records": records,
        }))
        loaded_records, fetched_at, last_attempt = self.cache.load_satcat()
        self.assertEqual(loaded_records, records)
        self.assertEqual(fetched_at, timestamp * 1000)
        self.assertEqual(last_attempt, 0)


    async def test_cooldown_without_cached_data_preserves_upstream_error(self) -> None:
        now = 1_800_000_000
        fetch_gp = AsyncMock(side_effect=httpx.ConnectError("offline"))
        with patch("app.data_layer.satellites.satellite_data_layer.time.time", return_value=now), \
             patch.object(self.source, "fetch_gp_records", new=fetch_gp):
            with self.assertRaises(httpx.ConnectError):
                await self.layer.fetch()
            with self.assertRaises(httpx.HTTPError):
                await self.layer.fetch()
        fetch_gp.assert_awaited_once()


class SatelliteSourceTests(IsolatedAsyncioTestCase):
    async def test_maps_each_mode_to_the_celestrak_query(self) -> None:
        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url, params):
                requests.append(params)
                return httpx.Response(200, json=[], request=httpx.Request("GET", url))

        requests = []
        source = CelesTrakClient()
        with patch("app.data_layer.satellites.source.httpx.AsyncClient", return_value=Client()):
            for mode in ("satellites", "debris", "rocket_bodies"):
                await source.fetch_gp_records(mode)
        self.assertEqual(requests, [
            {"GROUP": "active", "FORMAT": "JSON"},
            {"NAME": "DEB", "FORMAT": "JSON"},
            {"NAME": "R/B", "FORMAT": "JSON"},
        ])

    async def test_fetches_satcat_csv_records(self) -> None:
        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url):
                self_url.append(url)
                return httpx.Response(
                    200,
                    text="NORAD_CAT_ID,OBJECT_TYPE,OWNER,APOGEE,PERIGEE\n25544,PAY,US,420,418\n",
                    request=httpx.Request("GET", url),
                )

        self_url = []
        source = CelesTrakClient()
        with patch("app.data_layer.satellites.source.httpx.AsyncClient", return_value=Client()):
            records = await source.fetch_satcat_records()
        self.assertEqual(records[25544]["OBJECT_TYPE"], "PAY")
        self.assertEqual(self_url, [source.satcat_url])

    async def test_active_feed_defaults_missing_operational_status_to_active(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = CelesTrakClient()
            cache = SatelliteCache(Path(directory) / "feeds.json", Path(directory) / "satcat.json")
            layer = SatelliteDataLayer(source=source, cache=cache)
            with patch.object(source, "fetch_gp_records", new=AsyncMock(return_value=[omm_record()])), \
                 patch.object(source, "fetch_satcat_records", new=AsyncMock(return_value={25544: {"OPS_STATUS_CODE": ""}})):
                satellites = await layer._retrieve_and_normalize_records("satellites")
            self.assertEqual(satellites[0].operationalStatus, "active")

    async def test_debris_and_rocket_modes_require_type_and_current_earth_orbit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = CelesTrakClient()
            cache = SatelliteCache(Path(directory) / "feeds.json", Path(directory) / "satcat.json")
            layer = SatelliteDataLayer(source=source, cache=cache)
            records = [omm_record(NORAD_CAT_ID=number, OBJECT_NAME="TEST DEB") for number in range(1, 5)]
            catalog = {
                1: {"OBJECT_TYPE": "DEB", "ORBIT_CENTER": "EA", "ORBIT_TYPE": "ORB", "DECAY_DATE": ""},
                2: {"OBJECT_TYPE": "R/B", "ORBIT_CENTER": "EA", "ORBIT_TYPE": "ORB", "DECAY_DATE": ""},
                3: {"OBJECT_TYPE": "DEB", "ORBIT_CENTER": "EA", "ORBIT_TYPE": "ORB", "DECAY_DATE": "2025-01-01"},
                4: {"OBJECT_TYPE": "DEB", "ORBIT_CENTER": "MO", "ORBIT_TYPE": "ORB", "DECAY_DATE": ""},
            }
            with patch.object(source, "fetch_gp_records", new=AsyncMock(return_value=records)), \
                 patch.object(source, "fetch_satcat_records", new=AsyncMock(return_value=catalog)):
                debris = await layer._retrieve_and_normalize_records("debris")
                rockets = await layer._retrieve_and_normalize_records("rocket_bodies")
            self.assertEqual([item.noradId for item in debris], [1])
            self.assertEqual([item.noradId for item in rockets], [2])
