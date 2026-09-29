import httpx
from fastapi.testclient import TestClient
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

from app.data_layer.pipelines import PipelineDataLayer
from app.data_layer.pipelines.normalizer import PipelineNormalizer
from app.main import app


def feature(project_id="P12", geometry_type="LineString", coordinates=None, **properties):
    return {
        "type": "Feature",
        "id": project_id,
        "properties": {"ProjectID": project_id, "PipelineName": "Example Pipeline", **properties},
        "geometry": {"type": geometry_type, "coordinates": coordinates or [[10, 20], [11, 21]]},
    }


class PipelineNormalizerTests(TestCase):
    def test_normalizes_route_and_available_fields(self) -> None:
        pipeline = PipelineNormalizer.normalize_feature(
            feature(
                Fuel="NGL",
                Status="Operating",
                CountriesOrAreas="Canada; United States",
                Owner="Example Energy",
                LengthKnownKm="125.5",
                LengthEstimateKm="130",
                Capacity="4.2",
                CapacityUnits="million tonnes/year",
                StartYear1="2018",
                Wiki="https://gem.wiki/Example_Pipeline",
                RouteAccuracy="high",
            ),
            "oil",
        )

        self.assertIsNotNone(pipeline)
        self.assertEqual(pipeline.id, "oil:P12")
        self.assertEqual(pipeline.type, "NGL")
        self.assertEqual(pipeline.lengthKm, 125.5)
        self.assertEqual(pipeline.capacity, "4.2")
        self.assertEqual(pipeline.routes, [[(10.0, 20.0), (11.0, 21.0)]])
        self.assertEqual(pipeline.routeAccuracy, "high")

    def test_accepts_multiline_geometry_and_omits_unmapped_or_invalid_routes(self) -> None:
        multiline = feature(
            geometry_type="MultiLineString",
            coordinates=[[[10, 20], [11, 21]], [[12, 22], [13, 23]]],
        )
        self.assertEqual(len(PipelineNormalizer.normalize_feature(multiline, "gas").routes), 2)
        self.assertIsNone(PipelineNormalizer.normalize_feature({**multiline, "geometry": {"type": "LineString", "coordinates": None}}, "gas"))
        invalid = feature(coordinates=[[10, 20], [181, 21]])
        self.assertIsNone(PipelineNormalizer.normalize_feature(invalid, "gas"))

    def test_normalizes_collection_and_rejects_invalid_feed_shape(self) -> None:
        payload = {"type": "FeatureCollection", "features": [feature(), feature("P13", geometry_type="Point", coordinates=[1, 2])]}
        self.assertEqual([pipeline.id for pipeline in PipelineNormalizer.normalize_collection(payload, "gas")], ["gas:P12"])
        with self.assertRaises(ValueError):
            PipelineNormalizer.normalize_collection({"features": []}, "gas")


class PipelineDataLayerTests(IsolatedAsyncioTestCase):
    async def test_caches_successful_feed_for_the_daily_interval(self) -> None:
        source = AsyncMock()
        source.fetch.return_value = {"type": "FeatureCollection", "features": [feature()]}
        layer = PipelineDataLayer(source)

        first = await layer.fetch("gas")
        second = await layer.fetch("gas")

        self.assertEqual(first, second)
        self.assertEqual(first.dataset, "Global Gas Infrastructure Tracker")
        source.fetch.assert_awaited_once_with("gas")

    async def test_returns_stale_cache_when_upstream_refresh_fails(self) -> None:
        source = AsyncMock()
        source.fetch.return_value = {"type": "FeatureCollection", "features": [feature()]}
        layer = PipelineDataLayer(source)
        await layer.fetch("gas")
        source.fetch.side_effect = httpx.ConnectError("upstream unavailable")

        with patch.object(PipelineDataLayer, "CACHE_INTERVAL_SECONDS", -1):
            stale = await layer.fetch("gas")

        self.assertTrue(stale.stale)
        self.assertEqual(len(stale.pipelines), 1)


class PipelineEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_gas_and_oil_endpoints_return_feed_envelopes(self) -> None:
        source = AsyncMock()
        source.fetch.return_value = {"type": "FeatureCollection", "features": [feature()]}
        layer = PipelineDataLayer(source)
        with patch("app.main._pipeline_data_layer", layer):
            gas = self.client.get("/api/pipelines/gas")
            oil = self.client.get("/api/pipelines/oil")

        self.assertEqual(gas.status_code, 200)
        self.assertEqual(gas.headers["cache-control"], "no-store")
        self.assertEqual(gas.json()["fuel"], "gas")
        self.assertEqual(gas.json()["pipelines"][0]["id"], "gas:P12")
        self.assertEqual(oil.status_code, 200)
        self.assertEqual(oil.json()["fuel"], "oil")
        self.assertEqual(oil.json()["pipelines"][0]["id"], "oil:P12")

    def test_reports_upstream_failure_without_a_cached_feed(self) -> None:
        with patch("app.main._pipeline_data_layer.fetch", new=AsyncMock(side_effect=httpx.ConnectError("unavailable"))):
            response = self.client.get("/api/pipelines/gas")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Gas pipeline data is temporarily unavailable")
