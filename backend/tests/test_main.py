import httpx
from fastapi.testclient import TestClient
from unittest import TestCase
from unittest.mock import AsyncMock, patch

from app.data_layer.earthquakes import Earthquake, normalize_earthquake
from app.main import app


class NormalizeEarthquakeTests(TestCase):
    def test_normalizes_usgs_feature(self) -> None:
        earthquake = normalize_earthquake({
            "id": "us7000example",
            "properties": {
                "mag": 4.2,
                "place": "10 km N of Example, Testland",
                "time": 1_790_000_000_000,
            },
            "geometry": {"coordinates": [-122.4, 37.8, 8.5]},
        })

        self.assertEqual(
            earthquake,
            Earthquake(
                id="us7000example",
                place="10 km N of Example, Testland",
                lat=37.8,
                lon=-122.4,
                magnitude=4.2,
                location="10 km N of Example, Testland",
                time=1_790_000_000_000,
                depth=8.5,
            ),
        )

    def test_skips_incomplete_feature(self) -> None:
        self.assertIsNone(normalize_earthquake({"id": "missing-fields"}))


class EarthquakeEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_returns_normalized_earthquakes_without_cache(self) -> None:
        earthquakes = [
            Earthquake(
                id="us7000example",
                place="Example",
                lat=37.8,
                lon=-122.4,
                magnitude=4.2,
                location="Example",
                time=1_790_000_000_000,
                depth=8.5,
            ),
        ]

        with patch("app.main.fetch_earthquakes", new=AsyncMock(return_value=earthquakes)):
            response = self.client.get("/api/earthquakes")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json(), [earthquakes[0].model_dump()])

    def test_returns_bad_gateway_when_upstream_is_unavailable(self) -> None:
        with patch(
            "app.main.fetch_earthquakes",
            new=AsyncMock(side_effect=httpx.ConnectError("USGS unavailable")),
        ):
            response = self.client.get("/api/earthquakes")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Earthquake data is temporarily unavailable")
