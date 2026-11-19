import asyncio
from datetime import datetime, timezone
from unittest import TestCase, IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.data_layer.severe_events import SevereEventDataLayer
from app.data_layer.severe_events.enrichment import normalize_overlays, normalize_details, population_measurements
from app.data_layer.severe_events.models import SevereEventOverlayFeed
from test_severe_events import feature, NOW

RING = [[0, 0], [1, 0], [1, 1], [0, 0]]


def geometry(shape='Polygon', coordinates=None, **props):
    return {'features': [{'geometry': {'type': shape, 'coordinates': coordinates if coordinates is not None else [RING]}, 'properties': props}]}


def event(kind='DR', episode=1):
    return SevereEventDataLayer.normalize_feature(feature(event_type=kind, event_id=12, episodeid=episode))


class EnrichmentNormalizerTests(TestCase):
    def test_ongoing_drought_scope_ignores_cutoff_and_iscurrent(self):
        drought = feature(event_type='DR', updated='2025-01-01T00:00:00', iscurrent='false', episodeid=24, eventname='Europe-2026')
        self.assertEqual(SevereEventDataLayer.normalize_collection({'features': [drought]}, NOW), [])
        rows = SevereEventDataLayer.normalize_collection({'features': [drought, drought, feature()]}, NOW, ongoing_droughts=True)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].episodeId, 24)
        self.assertEqual(rows[0].title, 'Drought · Europe-2026')

    def test_footprints_holes_and_antimeridian_are_preserved(self):
        outer = [[179, 0], [-179, 0], [-179, 2], [179, 2], [179, 0]]
        hole = [[179.2, .2], [179.4, .2], [179.4, .4], [179.2, .2]]
        for code, cls, kind in [('DR', 'Poly_area', 'drought-area'), ('FL', 'Poly_Affected', 'flood-area'), ('WF', 'Poly_area', 'fire-area')]:
            overlays = normalize_overlays(geometry(coordinates=[outer, hole], Class=cls, polygondate='2026-10-01T00:00:00'), event(code), SevereEventDataLayer._timestamp)
            self.assertEqual(overlays[0].kind, kind)
            self.assertEqual(overlays[0].coordinates, [outer, hole])
            self.assertIsNotNone(overlays[0].updatedAt)

    def test_unsupported_buffers_and_invalid_geometry_are_excluded(self):
        for code, cls in [('EQ', 'Poly_Circle'), ('VO', 'Poly_Circle'), ('FL', 'Poly_Global')]:
            self.assertEqual(normalize_overlays(geometry(Class=cls), event(code), SevereEventDataLayer._timestamp), [])
        for coords in [[[[181, 0], [0, 1], [0, 0], [181, 0]]], [[[0, 0], [1, 1], [0, 1]]]]:
            self.assertEqual(normalize_overlays(geometry(coordinates=coords, Class='Poly_area'), event(), SevereEventDataLayer._timestamp), [])
        with self.assertRaises(ValueError):
            normalize_overlays({}, event(), SevereEventDataLayer._timestamp)

    def test_cyclone_observation_forecast_wind_and_uncertainty(self):
        paths = geometry('LineString', [[179, 1], [-179, 2]], forecast=False)['features']
        paths += geometry('LineString', [[-179, 2], [-178, 3]], forecast=True)['features']
        paths += geometry(Class='Poly_Green', polygonlabel='60 km/h')['features']
        paths += geometry(Class='Poly_Green', polygonlabel='05/10 09:00')['features']  # dated wind radii aren't duplicate swaths
        paths += geometry(Class='Poly_Cones')['features']
        overlays = normalize_overlays({'features': paths}, event('TC'), SevereEventDataLayer._timestamp)
        self.assertEqual({o.kind for o in overlays}, {'track', 'wind-zone', 'uncertainty'})
        tracks = [o for o in overlays if o.kind == 'track']
        self.assertEqual({o.forecast for o in tracks}, {True, False})
        self.assertEqual([o.value for o in overlays if o.kind == 'wind-zone'], [60])

    def test_shaking_intensity(self):
        overlays = normalize_overlays(geometry(Class='Poly_SMPInt_5', intensity=5), event('EQ'), SevereEventDataLayer._timestamp)
        self.assertEqual((overlays[0].kind, overlays[0].value, overlays[0].unit), ('shaking', 5, 'MMI'))

    def test_optional_metadata_and_dated_impacts_are_not_summed(self):
        payload = feature(event_type='FL', event_id=12, sendai=[
            {'description': '10 households affected', 'region': 'A', 'dateinsert': '2026-10-01T00:00:00'},
            {'description': '12 households affected', 'region': 'A', 'dateinsert': '2026-10-02T00:00:00'},
        ], documents={'Report': 'https://www.gdacs.org/report.aspx', 'bad': 'javascript:alert(1)'})
        details = normalize_details(payload, event('FL'), SevereEventDataLayer._timestamp)
        self.assertEqual([r.description for r in details.impacts], ['12 households affected', '10 households affected'])
        self.assertFalse(any(s.label == 'bad' for s in details.sources))
        self.assertEqual(details.measurements, [])
        with self.assertRaises(ValueError):
            normalize_details(feature(event_id=99), event('FL'), SevereEventDataLayer._timestamp)

    def test_hazard_measurements_and_exposure_units(self):
        details = normalize_details(feature(event_type='EQ', event_id=12, earthquakedetails={'magnitude': '4.5', 'depth': '10', 'shakepopdescription': '130 thousand in MMI V'}), event('EQ'), SevereEventDataLayer._timestamp)
        self.assertEqual(details.measurements[1].value, '10 km')
        measurements = population_measurements({'datums': [{'datum': [{'scalars': {'scalar': [{'name': 'SUMPOP5.0', 'value': '46'}, {'name': 'SUMPOP2.0', 'value': '0'}, {'name': 'SUMPOP1.0', 'value': ''}]}}]}]}, 'WF')
        self.assertEqual([m.value for m in measurements], ['46 people', '0 people'])


class EnrichmentFetchTests(IsolatedAsyncioTestCase):
    async def test_cache_episode_invalidation_and_request_deduplication(self):
        layer = SevereEventDataLayer()
        with patch.object(layer, '_request', new=AsyncMock(return_value={'features': []})) as request:
            await asyncio.gather(*(layer._cached_request(event(), 'geometry', 'Polygons/getgeometry', {}) for _ in range(5)))
            self.assertEqual(request.await_count, 1)
            await layer._cached_request(event(episode=2), 'geometry', 'Polygons/getgeometry', {})
            self.assertEqual(request.await_count, 2)
            with patch('app.data_layer.severe_events.severe_event_data_layer.time.monotonic', return_value=layer._enrichment[next(iter(layer._enrichment))][0] + 361):
                await layer._cached_request(event(), 'geometry', 'Polygons/getgeometry', {})
            self.assertEqual(request.await_count, 3)

    async def test_geometry_failure_keeps_detail_metadata(self):
        layer = SevereEventDataLayer()
        with patch.object(layer, 'fetch', new=AsyncMock(return_value=[event('FL')])), patch.object(layer, '_cached_request', new=AsyncMock(return_value=feature(event_type='FL', event_id=12))), patch.object(layer, '_geometry', new=AsyncMock(side_effect=httpx.ConnectError('offline'))):
            details = await layer.details('FL', 12)
        self.assertEqual(details.event.id, 'FL:12')
        self.assertTrue(details.geometryUnavailable)

    async def test_overview_failure_is_partial(self):
        layer = SevereEventDataLayer()
        with patch.object(layer, 'fetch', new=AsyncMock(return_value=[event('TC'), event('DR')])), patch.object(layer, '_geometry', new=AsyncMock(side_effect=[httpx.ConnectError('offline'), []])):
            result = await layer.overlays(['cyclones', 'droughts'])
        self.assertEqual(result.unavailable, ['TC:12'])

    async def test_four_request_concurrency_limit(self):
        active = maximum = 0
        class Client:
            async def __aenter__(self): return self
            async def __aexit__(self, *_): pass
            async def get(self, url, params):
                nonlocal active, maximum
                active += 1
                maximum = max(maximum, active)
                await asyncio.sleep(.01)
                active -= 1
                return httpx.Response(200, json={}, request=httpx.Request('GET', url))
        layer = SevereEventDataLayer()
        with patch('app.data_layer.severe_events.severe_event_data_layer.httpx.AsyncClient', return_value=Client()):
            await asyncio.gather(*(layer._request('Events/geteventdata', {}) for _ in range(9)))
        self.assertEqual(maximum, 4)


class EnrichmentEndpointTests(TestCase):
    def test_overview_and_detail_error_mapping(self):
        client = TestClient(app)
        self.assertEqual(client.get('/api/severe-events/overlays?categories=invalid').status_code, 422)
        self.assertEqual(client.get('/api/severe-events/XX/12/details').status_code, 422)
        layer = SevereEventDataLayer()
        with patch('app.main._severe_event_data_layer', layer), patch.object(layer, 'details', new=AsyncMock(side_effect=LookupError('Gone'))):
            self.assertEqual(client.get('/api/severe-events/DR/12/details').status_code, 404)
        with patch('app.main._severe_event_data_layer', layer), patch.object(layer, 'overlays', new=AsyncMock(return_value=SevereEventOverlayFeed(overlays=[]))):
            response = client.get('/api/severe-events/overlays')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['cache-control'], 'no-store')
        with patch('app.main._severe_event_data_layer', layer), patch.object(layer, 'details', new=AsyncMock(side_effect=httpx.ConnectError('offline'))):
            self.assertEqual(client.get('/api/severe-events/DR/12/details').status_code, 502)
