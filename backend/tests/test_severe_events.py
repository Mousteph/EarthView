from datetime import datetime, timedelta, timezone
import httpx
from fastapi.testclient import TestClient
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

from app.data_layer.severe_events import SevereEvent, SevereEventCategory, SevereEventDataLayer
from app.main import app


NOW = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)


def feature(event_id=1104122, event_type="FL", title="Flood in Thailand", coordinates=None,
            updated="2026-10-02T07:23:32", **properties):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": coordinates if coordinates is not None else [98.9954, 17.1054]},
        "properties": {
            "eventtype": event_type,
            "eventid": event_id,
            "name": title,
            "description": title,
            "url": {"report": "https://www.gdacs.org/report.aspx?eventid=1104122&eventtype=FL"},
            "alertlevel": "Green",
            "country": "Thailand",
            "fromdate": "2026-08-18T01:00:00",
            "datemodified": updated,
            "severitydata": {"severity": 0.0, "severitytext": "Magnitude 0 ", "severityunit": ""},
            **properties,
        },
    }


class SevereEventNormalizerTests(TestCase):
    def test_normalizes_thailand_flood_and_provider_metadata(self) -> None:
        event = SevereEventDataLayer.normalize_feature(feature())
        self.assertEqual(event.id, "FL:1104122")
        self.assertEqual(event.eventType, "FL")
        self.assertEqual(event.categories, [SevereEventCategory(id="floods", title="Floods")])
        self.assertEqual((event.lon, event.lat), (98.9954, 17.1054))
        self.assertEqual(event.country, "Thailand")
        self.assertEqual(event.alertLevel, "Green")
        self.assertEqual(event.severity, None)
        self.assertEqual(event.description, None)
        self.assertEqual(event.startedAt, int(datetime(2026, 8, 18, 1, tzinfo=timezone.utc).timestamp() * 1000))
        self.assertEqual(event.updatedAt, int(datetime(2026, 10, 2, 7, 23, 32, tzinfo=timezone.utc).timestamp() * 1000))

    def test_supported_types_fire_alias_and_severity(self) -> None:
        expected = {"EQ": "earthquakes", "FL": "floods", "TC": "cyclones", "VO": "volcanoes",
                    "WF": "wildfires", "FF": "wildfires", "DR": "droughts"}
        for event_type, category in expected.items():
            with self.subTest(event_type=event_type):
                event = SevereEventDataLayer.normalize_feature(feature(
                    event_type=event_type,
                    severitydata={"severity": 4.5, "severitytext": "Magnitude 4.5M", "severityunit": "M"},
                ))
                self.assertEqual(event.categories[0].id, category)
                self.assertEqual(event.severity, "Magnitude 4.5M")
                self.assertEqual(event.eventType, "WF" if event_type == "FF" else event_type)

    def test_missing_optional_metadata_and_invalid_records(self) -> None:
        event = SevereEventDataLayer.normalize_feature(feature(country="", url=None, severitydata=None, alertlevel=None))
        self.assertIsNone(event.country)
        self.assertIsNone(event.link)
        self.assertIsNone(event.severity)
        self.assertIsNone(event.alertLevel)
        self.assertIsNone(SevereEventDataLayer.normalize_feature(feature(event_type="XX")))
        self.assertIsNone(SevereEventDataLayer.normalize_feature(feature(event_type=[])))
        for event_id in [True, "abc", "-1", "١"]:
            self.assertIsNone(SevereEventDataLayer.normalize_feature(feature(event_id=event_id)))
        self.assertEqual(SevereEventDataLayer.normalize_feature(feature(event_id="0012")).id, "FL:12")
        self.assertIsNone(SevereEventDataLayer.normalize_feature(feature(coordinates=[181, 0])))
        self.assertIsNone(SevereEventDataLayer.normalize_feature(feature(coordinates=["bad", 0])))
        self.assertIsNone(SevereEventDataLayer.normalize_feature(feature(updated="")))
        self.assertIsNone(SevereEventDataLayer.normalize_feature(feature(fromdate="")))
        self.assertIsNone(SevereEventDataLayer.normalize_feature({**feature(), "geometry": {"type": "Polygon", "coordinates": []}}))

    def test_rolls_over_seven_days_and_keeps_latest_episode(self) -> None:
        old = feature(event_id=1, updated="2026-09-26T11:59:59")
        recent = feature(event_id=1, updated="2026-10-02T10:00:00", title="Old episode")
        latest = feature(event_id=1, updated="2026-10-03T11:00:00", title="Latest episode")
        future = feature(event_id=2, updated="2026-10-03T12:00:01")
        events = SevereEventDataLayer.normalize_collection({"features": [old, recent, latest, future]}, NOW)
        self.assertEqual([event.id for event in events], ["FL:1"])
        self.assertEqual(events[0].title, "Latest episode")

    def test_rejects_invalid_feed_shape(self) -> None:
        with self.assertRaises(ValueError):
            SevereEventDataLayer.normalize_collection({"events": []}, NOW)


class SevereEventFetchTests(IsolatedAsyncioTestCase):
    async def test_pages_past_first_hundred_and_caches_success(self) -> None:
        updated = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        pages = [
            [feature(event_id=index, updated=updated) for index in range(1, 101)],
            [feature(event_id=1104122, updated=updated)],
        ]
        calls = []

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, url, params):
                if params.get("eventtype") == "DR":
                    return httpx.Response(200, json={"features": []}, request=httpx.Request("GET", url))
                calls.append(params["pagenumber"])
                return httpx.Response(200, json={"type": "FeatureCollection", "features": pages[params["pagenumber"] - 1]},
                                      request=httpx.Request("GET", url))

        layer = SevereEventDataLayer()
        with patch("app.data_layer.severe_events.severe_event_data_layer.httpx.AsyncClient", return_value=FakeClient()):
            first = await layer.fetch()
            second = await layer.fetch()
        self.assertEqual(calls, [1, 2])
        self.assertEqual(len(first), 101)
        self.assertIs(first, second)
        self.assertIn("FL:1104122", {event.id for event in first})


class SevereEventEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_returns_normalized_events_without_http_cache(self) -> None:
        event = SevereEvent(
            id="FL:1104122", eventType="FL", title="Flood in Thailand", description=None, link=None,
            categories=[SevereEventCategory(id="floods", title="Floods")], lat=17.1, lon=99.0,
            alertLevel="Green", severity=None, country="Thailand", startedAt=1_776_473_200_000,
            updatedAt=1_791_005_012_000,
        )
        layer = SevereEventDataLayer()
        with patch.object(layer, "fetch", new=AsyncMock(return_value=[event])), patch("app.main._severe_event_data_layer", layer):
            response = self.client.get("/api/severe-events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json()[0]["id"], "FL:1104122")
        self.assertEqual(response.json()[0]["country"], "Thailand")

    def test_maps_upstream_failure_to_bad_gateway(self) -> None:
        layer = SevereEventDataLayer()
        with patch.object(layer, "fetch", new=AsyncMock(side_effect=httpx.ConnectError("unavailable"))), patch("app.main._severe_event_data_layer", layer):
            response = self.client.get("/api/severe-events")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Severe event data is temporarily unavailable")
