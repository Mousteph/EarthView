import httpx
from fastapi.testclient import TestClient
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

from app.data_layer.firms import Fire, fetch_fires, normalize_fire
from app.main import app


class NormalizeFireTests(TestCase):
    def test_normalizes_viirs_detection(self) -> None:
        row = {
            "latitude": "28.30746", "longitude": "67.32551", "acq_date": "2025-06-06",
            "acq_time": "922", "satellite": "N20", "instrument": "VIIRS",
            "confidence": "n", "frp": "5.12", "scan": "0.46", "track": "0.64",
        }
        fire = normalize_fire(row)
        self.assertIsNotNone(fire)
        self.assertEqual(fire.lat, 28.30746)
        self.assertEqual(fire.lon, 67.32551)
        self.assertEqual(fire.time, 1_749_201_720_000)
        self.assertEqual(fire.confidence, "Nominal")
        self.assertEqual(fire.frp, 5.12)
        self.assertEqual(fire.satellite, "N20")
        self.assertEqual(fire.instrument, "VIIRS")
        self.assertEqual(fire.id, normalize_fire(row).id)

    def test_omits_bad_optional_data_and_invalid_position(self) -> None:
        row = {"latitude": "0", "longitude": "0", "acq_date": "2025-06-06", "acq_time": "0922", "frp": "NaN"}
        fire = normalize_fire(row)
        self.assertIsNone(fire.frp)
        self.assertIsNone(fire.confidence)
        self.assertIsNone(normalize_fire({**row, "latitude": "91"}))


class FireEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_returns_normalized_fires_without_cache(self) -> None:
        fire = Fire(id="example", lat=1, lon=2, time=3, confidence="High", frp=4, satellite="N20", instrument="VIIRS")
        with patch("app.main.fetch_fires", new=AsyncMock(return_value=[fire])):
            response = self.client.get("/api/fires")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json(), [fire.model_dump()])

    def test_reports_missing_key_and_upstream_failure(self) -> None:
        with patch("app.main.fetch_fires", new=AsyncMock(side_effect=RuntimeError("missing key"))):
            missing = self.client.get("/api/fires")
        with patch("app.main.fetch_fires", new=AsyncMock(side_effect=httpx.ConnectError("unavailable"))):
            unavailable = self.client.get("/api/fires")
        self.assertEqual(missing.status_code, 503)
        self.assertEqual(unavailable.status_code, 502)


class FirmsFeedTests(IsolatedAsyncioTestCase):
    async def test_parses_and_reuses_global_feed(self) -> None:
        csv_data = (
            "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,scan,track\n"
            "28.30746,67.32551,2025-06-06,922,N20,VIIRS,n,5.12,0.46,0.64\n"
        )
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.get.return_value = httpx.Response(
            200, text=csv_data, request=httpx.Request("GET", "https://example.test")
        )
        with patch("app.data_layer.firms.read_firms_map_key", return_value="test-key"), \
             patch("app.data_layer.firms._cached_fires", None), \
             patch("app.data_layer.firms._cache_expires_at", 0.0), \
             patch("app.data_layer.firms.httpx.AsyncClient", return_value=client):
            first = await fetch_fires()
            second = await fetch_fires()

        self.assertEqual(len(first), 1)
        self.assertEqual(first, second)
        self.assertEqual(first[0].frp, 5.12)
        client.get.assert_awaited_once_with(
            "https://firms.modaps.eosdis.nasa.gov/api/area/csv/test-key/VIIRS_NOAA20_NRT/world/1"
        )
