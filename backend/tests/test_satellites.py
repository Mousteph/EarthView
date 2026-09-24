import json
import tempfile
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.data_layer import satellites
from app.data_layer.satellites import Satellite, fetch_satellites, infer_mission, normalize_omm, orbit_class
from app.main import app


def omm_record(**overrides: object) -> dict[str, object]:
    return {
        "OBJECT_NAME": "ISS (ZARYA)", "NORAD_CAT_ID": 25544, "EPOCH": "2026-09-23T12:00:00.000Z",
        "MEAN_MOTION": 15.5, "ECCENTRICITY": 0.0001, "INCLINATION": 51.6,
        "RA_OF_ASC_NODE": 120.0, "ARG_OF_PERICENTER": 80.0, "MEAN_ANOMALY": 210.0,
        "BSTAR": 0.0002, "MEAN_MOTION_DOT": 0.00001, "MEAN_MOTION_DDOT": 0.0,
        "EPHEMERIS_TYPE": 0, "CLASSIFICATION_TYPE": "U", "ELEMENT_SET_NO": 999, "REV_AT_EPOCH": 12345,
        **overrides,
    }


class SatelliteNormalizationTests(TestCase):
    def test_normalizes_gp_and_joined_satcat_metadata(self) -> None:
        satellite = normalize_omm(omm_record(), {
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
        self.assertIsNone(normalize_omm({"OBJECT_NAME": "incomplete"}))
        self.assertIsNone(normalize_omm(omm_record(ECCENTRICITY=1.2)))
        item = normalize_omm(omm_record(OBJECT_NAME="UNKNOWN OBJECT"))
        self.assertIsNone(item.owner)
        self.assertEqual(item.missionType, "Other / Unclassified")
        self.assertTrue(item.apsidesEstimated)
        self.assertIsNone(item.operationalStatus)
        self.assertGreater(item.apogeeKm, 200)
        self.assertLess(item.apogeeKm, 600)
        self.assertEqual(item.epoch, "2026-09-23T12:00:00Z")

    def test_maps_satcat_operational_status_without_guessing_unknown_codes(self) -> None:
        for code in ("+", "P", "B", "S", "X"):
            with self.subTest(code=code):
                self.assertEqual(normalize_omm(omm_record(), {"OPS_STATUS_CODE": code}).operationalStatus, "active")
        for code in ("-", "D"):
            with self.subTest(code=code):
                self.assertEqual(normalize_omm(omm_record(), {"OPS_STATUS_CODE": code}).operationalStatus, "inactive")
        for code in ("?", "", "UNKNOWN"):
            with self.subTest(code=code):
                self.assertIsNone(normalize_omm(omm_record(), {"OPS_STATUS_CODE": code}).operationalStatus)

    def test_mission_inference_includes_recognized_types_and_constellations(self) -> None:
        self.assertEqual(infer_mission("STARLINK-1000"), ("Communications", "Starlink"))
        self.assertEqual(infer_mission("GALILEO-FOC FM1"), ("Navigation", "Galileo"))
        self.assertEqual(infer_mission("LANDSAT 9"), ("Earth Observation", None))
        self.assertEqual(infer_mission("MYSTERY"), ("Other / Unclassified", None))

    def test_orbit_classes_are_spelled_out(self) -> None:
        self.assertEqual(orbit_class(800, 700), "Low Earth Orbit")
        self.assertEqual(orbit_class(20_500, 20_000), "Medium Earth Orbit")
        self.assertEqual(orbit_class(35_900, 35_700), "Geosynchronous Orbit")
        self.assertEqual(orbit_class(50_000, 500), "Highly Elliptical Orbit")
        self.assertEqual(orbit_class(45_000, 40_000), "High Earth Orbit")


class SatelliteEndpointTests(TestCase):
    def test_returns_default_normalized_feed_contract(self) -> None:
        feed = satellites.SatelliteFeed(category="active", mode="satellites", fetchedAt=1_790_000_000_000, satellites=[normalize_omm(omm_record())])
        with patch("app.main.fetch_satellites", new=AsyncMock(return_value=feed)) as fetch:
            response = TestClient(app).get("/api/satellites")
        fetch.assert_awaited_once_with("satellites")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json()["mode"], "satellites")
        self.assertEqual(response.json()["satellites"][0]["meanMotion"], 15.5)

    def test_accepts_each_mode_and_rejects_unknown_mode(self) -> None:
        for mode in ("satellites", "debris", "rocket_bodies"):
            feed = satellites.SatelliteFeed(mode=mode, fetchedAt=1_790_000_000_000, satellites=[])
            with patch("app.main.fetch_satellites", new=AsyncMock(return_value=feed)) as fetch:
                response = TestClient(app).get("/api/satellites", params={"mode": mode})
            fetch.assert_awaited_once_with(mode)
            self.assertEqual(response.status_code, 200)
        self.assertEqual(TestClient(app).get("/api/satellites", params={"mode": "invalid"}).status_code, 422)

    def test_returns_bad_gateway_when_feed_is_unavailable(self) -> None:
        with patch("app.main.fetch_satellites", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
            response = TestClient(app).get("/api/satellites")
        self.assertEqual(response.status_code, 502)


class SatelliteFeedCacheTests(IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.cache = Path(self.temp_dir.name) / "satellites_active.json"
        self.patchers = [
            patch.object(satellites, "CACHE_PATH", self.cache),
            patch.object(satellites, "SATCAT_CACHE_PATH", Path(self.temp_dir.name) / "satcat.json"),
            patch.object(satellites, "_cached_feeds", {mode: None for mode in satellites.MODES}),
            patch.object(satellites, "_next_attempts", {mode: 0.0 for mode in satellites.MODES}),
            patch.object(satellites, "_failure_counts", {mode: 0 for mode in satellites.MODES}),
            patch.object(satellites, "_loaded_modes", set()),
            patch.object(satellites, "_satcat", {}), patch.object(satellites, "_satcat_loaded", True),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self) -> None:
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temp_dir.cleanup()

    async def test_caches_modes_independently_and_persists(self) -> None:
        records = [normalize_omm(omm_record())]
        with patch("app.data_layer.satellites.time.time", return_value=1_800_000_000), patch("app.data_layer.satellites._fetch_mode_upstream", new=AsyncMock(return_value=records)) as fetch:
            await fetch_satellites("satellites")
            await fetch_satellites("satellites")
            await fetch_satellites("debris")
        self.assertEqual(fetch.await_args_list, [(("satellites",),), (("debris",),)])
        self.assertTrue(self.cache.is_file())
        self.assertTrue(self.cache.with_name("satellites_debris.json").is_file())

    async def test_loads_persisted_feed_after_module_cache_reset(self) -> None:
        timestamp = 1_800_000_000
        feed = satellites.SatelliteFeed(fetchedAt=timestamp * 1000, satellites=[normalize_omm(omm_record())])
        self.cache.write_text(json.dumps({"feed": feed.model_dump(), "nextAttemptAt": timestamp + 1000, "failureCount": 0}))
        with patch("app.data_layer.satellites.time.time", return_value=timestamp + 1), patch("app.data_layer.satellites._fetch_mode_upstream", new=AsyncMock()) as fetch:
            loaded = await fetch_satellites()
        fetch.assert_not_awaited()
        self.assertEqual(loaded.satellites, feed.satellites)

    async def test_upgrades_legacy_cache_without_redownloading_gp(self) -> None:
        timestamp = 1_800_000_000
        record = normalize_omm(omm_record()).model_dump()
        for key in ("missionType", "orbitClass", "orbitalPeriodMinutes", "orbitsPerDay", "apogeeKm", "perigeeKm"):
            record.pop(key)
        self.cache.write_text(json.dumps({"feed": {"category": "active", "fetchedAt": timestamp * 1000, "satellites": [record]}, "nextAttemptAt": timestamp + 1000}))
        with patch("app.data_layer.satellites.time.time", return_value=timestamp + 1), \
             patch("app.data_layer.satellites._ensure_satcat", new=AsyncMock(return_value={25544: {"OBJECT_TYPE": "PAY", "OWNER": "US", "APOGEE": "420", "PERIGEE": "418"}})), \
             patch("app.data_layer.satellites._fetch_mode_upstream", new=AsyncMock()) as fetch:
            loaded = await fetch_satellites()
        fetch.assert_not_awaited()
        self.assertEqual(loaded.satellites[0].owner, "United States")
        self.assertEqual(loaded.satellites[0].orbitClass, "Low Earth Orbit")
        self.assertEqual(loaded.satellites[0].orbitalPeriodMinutes, 1440 / 15.5)

    async def test_serves_stale_feed_after_refresh_error_and_enforces_stale_limit(self) -> None:
        timestamp = 1_800_000_000
        satellites._cached_feeds["satellites"] = satellites.SatelliteFeed(fetchedAt=(timestamp - satellites.SUCCESS_TTL_SECONDS - 1) * 1000, satellites=[normalize_omm(omm_record())])
        satellites._loaded_modes.add("satellites")
        with patch("app.data_layer.satellites.time.time", return_value=timestamp), patch("app.data_layer.satellites._fetch_mode_upstream", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
            self.assertTrue((await fetch_satellites()).stale)
        satellites._cached_feeds["satellites"] = satellites.SatelliteFeed(fetchedAt=(timestamp - satellites.MAX_STALE_SECONDS - 1) * 1000, satellites=[normalize_omm(omm_record())])
        satellites._next_attempts["satellites"] = 0
        with patch("app.data_layer.satellites.time.time", return_value=timestamp), patch("app.data_layer.satellites._fetch_mode_upstream", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
            with self.assertRaises(httpx.ConnectError):
                await fetch_satellites()


class SatelliteSourceTests(IsolatedAsyncioTestCase):
    async def test_active_catalog_marks_objects_active_when_satcat_status_is_blank(self) -> None:
        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url, params):
                self_params.append(params)
                return httpx.Response(200, json=[omm_record()], request=httpx.Request("GET", url))

        self_params = []
        with patch("app.data_layer.satellites.httpx.AsyncClient", return_value=Client()), \
             patch("app.data_layer.satellites._ensure_satcat", new=AsyncMock(return_value={25544: {"OPS_STATUS_CODE": ""}})):
            feed = await satellites._fetch_upstream("active")
        self.assertEqual(feed[0].operationalStatus, "active")
        self.assertEqual(self_params, [{"GROUP": "active", "FORMAT": "JSON"}])

    async def test_satcat_stale_fallback_and_seven_day_limit(self) -> None:
        now = 1_800_000_000
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "satcat.json"
            path.write_text(json.dumps({"fetchedAt": (now - 2 * 86_400) * 1000, "nextAttemptAt": 0, "records": {"25544": {"OBJECT_TYPE": "PAY"}}}))
            with patch.object(satellites, "SATCAT_CACHE_PATH", path), \
                 patch.object(satellites, "_satcat_loaded", False), patch.object(satellites, "_satcat", {}), \
                 patch.object(satellites, "_satcat_fetched_at", 0), patch.object(satellites, "_satcat_next_attempt_at", 0), \
                 patch("app.data_layer.satellites.time.time", return_value=now), \
                 patch("app.data_layer.satellites._fetch_satcat", new=AsyncMock(side_effect=httpx.ConnectError("offline"))) as fetch:
                self.assertEqual((await satellites._ensure_satcat())[25544]["OBJECT_TYPE"], "PAY")
                self.assertEqual((await satellites._ensure_satcat())[25544]["OBJECT_TYPE"], "PAY")
                fetch.assert_awaited_once()
            path.write_text(json.dumps({"fetchedAt": (now - 8 * 86_400) * 1000, "nextAttemptAt": 0, "records": {"25544": {"OBJECT_TYPE": "PAY"}}}))
            with patch.object(satellites, "SATCAT_CACHE_PATH", path), \
                 patch.object(satellites, "_satcat_loaded", False), patch.object(satellites, "_satcat", {}), \
                 patch.object(satellites, "_satcat_fetched_at", 0), patch.object(satellites, "_satcat_next_attempt_at", 0), \
                 patch("app.data_layer.satellites.time.time", return_value=now), \
                 patch("app.data_layer.satellites._fetch_satcat", new=AsyncMock(side_effect=httpx.ConnectError("offline"))):
                with self.assertRaises(httpx.ConnectError):
                    await satellites._ensure_satcat()

    async def test_satcat_csv_uses_raw_catalog_and_persists(self) -> None:
        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url):
                self_url.append(url)
                return httpx.Response(200, text="NORAD_CAT_ID,OBJECT_TYPE,OWNER,APOGEE,PERIGEE\n25544,PAY,US,420,418\n", request=httpx.Request("GET", url))

        self_url = []
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(satellites, "SATCAT_CACHE_PATH", Path(directory) / "satcat.json"), \
             patch("app.data_layer.satellites.httpx.AsyncClient", return_value=Client()):
            records, _ = await satellites._fetch_satcat()
            self.assertEqual(records[25544]["OBJECT_TYPE"], "PAY")
            self.assertTrue(satellites.SATCAT_CACHE_PATH.is_file())
        self.assertEqual(self_url, [satellites.CELESTRAK_SATCAT_URL])

    async def test_debris_and_rocket_modes_require_satcat_type_and_current_earth_orbit(self) -> None:
        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url, params):
                self_params.append(params)
                rows = [omm_record(NORAD_CAT_ID=number, OBJECT_NAME="TEST DEB") for number in range(1, 5)]
                return httpx.Response(200, json=rows, request=httpx.Request("GET", url))

        self_params = []
        catalog = {
            1: {"OBJECT_TYPE": "DEB", "ORBIT_CENTER": "EA", "ORBIT_TYPE": "ORB", "DECAY_DATE": ""},
            2: {"OBJECT_TYPE": "R/B", "ORBIT_CENTER": "EA", "ORBIT_TYPE": "ORB", "DECAY_DATE": ""},
            3: {"OBJECT_TYPE": "DEB", "ORBIT_CENTER": "EA", "ORBIT_TYPE": "ORB", "DECAY_DATE": "2025-01-01"},
            4: {"OBJECT_TYPE": "DEB", "ORBIT_CENTER": "MO", "ORBIT_TYPE": "ORB", "DECAY_DATE": ""},
        }
        with patch("app.data_layer.satellites.httpx.AsyncClient", return_value=Client()), \
             patch("app.data_layer.satellites._ensure_satcat", new=AsyncMock(return_value=catalog)):
            debris = await satellites._fetch_mode_upstream("debris")
            rockets = await satellites._fetch_mode_upstream("rocket_bodies")
        self.assertEqual([item.noradId for item in debris], [1])
        self.assertEqual([item.noradId for item in rockets], [2])
        self.assertEqual(self_params, [{"NAME": "DEB", "FORMAT": "JSON"}, {"NAME": "R/B", "FORMAT": "JSON"}])
