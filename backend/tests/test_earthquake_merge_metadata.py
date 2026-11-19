"""Matching fields verified against GDACS EQ:1569463, fetched 4 October 2026."""
import json
from pathlib import Path
from datetime import datetime, timezone
from unittest import TestCase, IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
import httpx
from app.data_layer.earthquakes import EarthquakeDataLayer
from app.data_layer.severe_events import SevereEventDataLayer
from app.data_layer.severe_events.earthquake import normalize_earthquake

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/gdacs_earthquake_advisory.json').read_text())


class MetadataTests(TestCase):
    def test_live_gdacs_advisory_measurements_and_usgs_reference(self):
        quake = SevereEventDataLayer.normalize_feature(FIXTURE)
        self.assertEqual(quake.earthquake.sourceIds, ['us6000tzj8'])
        self.assertEqual((quake.earthquake.magnitude, quake.earthquake.depth), (5, 10))
        self.assertEqual(quake.earthquake.sourceUrl, 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000tzj8')

    def test_summary_fallback_and_safe_provider_ids(self):
        p = FIXTURE['properties']
        summary = {k: v for k, v in p.items() if k not in {'earthquakedetails', 'sourceid'}}
        q = normalize_earthquake(summary)
        self.assertEqual((q.magnitude, q.depth), (5, 10))
        self.assertEqual(q.sourceIds, [])
        self.assertEqual(normalize_earthquake({**p, 'source': 'EMSC', 'sourceid': 'us6000tzj8'}).sourceIds, [])
        self.assertEqual(normalize_earthquake({'earthquakedetails': {'magnitude': 'nan', 'depth': True}}).magnitude, None)
        self.assertEqual(normalize_earthquake({'documents': {'evil': 'https://earthquake.usgs.gov.evil.test/earthquakes/eventpage/us123'}}).sourceIds, [])
        self.assertEqual(normalize_earthquake({'documents': {'report': 'https://earthquake.usgs.gov/earthquakes/eventpage/us123/executive'}}).sourceIds, ['us123'])

    def test_usgs_aliases_urls_update_and_invalid_coordinates(self):
        feature = {'id': 'us123', 'geometry': {'coordinates': [179.9, 0, 0]},
                   'properties': {'place': 'Dateline', 'mag': 0, 'time': 100, 'updated': 200, 'ids': ',us123,at456,', 'url': 'javascript:bad'}}
        q = EarthquakeDataLayer.normalize(feature)
        self.assertEqual(q.sourceIds, ['us123', 'at456'])
        self.assertEqual(q.updatedAt, 200)
        self.assertTrue(q.sourceUrl.startswith('https://earthquake.usgs.gov/'))
        self.assertIn('all_week', EarthquakeDataLayer.feed_url)
        self.assertIsNone(EarthquakeDataLayer.normalize({**feature, 'geometry': {'coordinates': [0, 91, 0]}}))
        self.assertIsNone(EarthquakeDataLayer.normalize({**feature, 'properties': {**feature['properties'], 'mag': float('nan')}}))

    def test_gdacs_quake_window_uses_occurrence_not_advisory_update(self):
        old = {**FIXTURE, 'properties': {**FIXTURE['properties'], 'fromdate': '2026-09-01T00:00:00'}}
        now = datetime(2026, 10, 4, 16, tzinfo=timezone.utc)
        self.assertEqual(SevereEventDataLayer.normalize_collection({'features': [old]}, now), [])
        self.assertEqual(len(SevereEventDataLayer.normalize_collection({'features': [FIXTURE, FIXTURE]}, now)), 1)


class MetadataFetchTests(IsolatedAsyncioTestCase):
    async def test_metadata_uses_existing_cache_and_failure_preserves_summary(self):
        layer = SevereEventDataLayer()
        event = layer.normalize_feature(FIXTURE)
        with patch.object(layer, '_request', new=AsyncMock(return_value=FIXTURE)) as request:
            enriched = await layer._earthquake_metadata(event)
            await layer._earthquake_metadata(event)
            self.assertEqual(request.await_count, 1)
            self.assertEqual(enriched.earthquake.sourceIds, ['us6000tzj8'])
        with patch.object(layer, '_cached_request', new=AsyncMock(side_effect=httpx.ConnectError('offline'))):
            self.assertIs(await layer._earthquake_metadata(event), event)
