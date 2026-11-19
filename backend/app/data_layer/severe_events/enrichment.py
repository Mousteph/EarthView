"""Normalize GDACS enrichment; only recognized, meaningful hazard geometry crosses the API."""
from math import isfinite
from typing import Any
from urllib.parse import urlparse

from .models import SevereEvent, SevereEventDetails, SevereEventImpact, SevereEventMeasurement, SevereEventOverlay, SevereEventSource


def safe_link(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    return value if parsed.scheme == 'https' and parsed.hostname in {'www.gdacs.org', 'data.gdacs.org', 'gdacs.org'} else None


def normalize_overlays(payload: Any, event: SevereEvent, timestamp) -> list[SevereEventOverlay]:
    if not isinstance(payload, dict) or not isinstance(payload.get('features'), list):
        raise ValueError('GDACS returned invalid geometry')
    overlays = []
    for feature in payload['features']:
        if not isinstance(feature, dict):
            continue
        properties, geometry = feature.get('properties'), feature.get('geometry')
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        kind, label, value, unit = None, None, None, None
        shape = geometry.get('type')
        polygon_class = str(properties.get('Class', '')).lower()
        provider_label = str(properties.get('polygonlabel', ''))
        if event.eventType == 'TC':
            if shape in {'LineString', 'MultiLineString'} and isinstance(properties.get('forecast'), bool):
                kind, label = 'track', 'Forecast track' if properties['forecast'] else 'Recorded track'
            elif polygon_class in {'poly_green', 'poly_orange', 'poly_red'} and provider_label in {'60 km/h', '90 km/h', '120 km/h'}:
                kind, label, value, unit = 'wind-zone', 'Wind zone', float(provider_label.split()[0]), 'km/h'
            elif polygon_class == 'poly_cones':
                kind, label = 'uncertainty', 'Forecast uncertainty'
        elif event.eventType == 'DR' and polygon_class == 'poly_area':
            kind, label = 'drought-area', 'Agricultural drought impact risk area'
        elif event.eventType == 'WF' and polygon_class == 'poly_area':
            kind, label = 'fire-area', 'Fire affected area'
        elif event.eventType == 'FL' and polygon_class == 'poly_affected':
            kind, label = 'flood-area', 'Reported flood affected area'
        elif event.eventType == 'EQ' and polygon_class.startswith('poly_smpint_'):
            try:
                value = float(properties.get('intensity'))
                if not isfinite(value) or value <= 0:
                    continue
            except (TypeError, ValueError):
                continue
            kind, label, unit = 'shaking', 'Shaking intensity', 'MMI'
        if not kind or shape not in {'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'} or ((kind == 'track') != (shape in {'LineString', 'MultiLineString'})):
            continue
        coordinates = geometry.get('coordinates')
        if not valid_coordinates(shape, coordinates):
            continue
        overlays.append(SevereEventOverlay(
            eventId=event.id, episodeId=event.episodeId, kind=kind, label=label,
            geometryType=shape, coordinates=coordinates,
            forecast=properties.get('forecast') is True,
            updatedAt=timestamp(properties.get('polygondate')), value=value, unit=unit,
        ))
    if event.eventType == 'TC':
        for forecast in [False, True]:
            tracks = [o for o in overlays if o.kind == 'track' and o.forecast == forecast]
            if tracks:
                paths = [path for o in tracks for path in ([o.coordinates] if o.geometryType == 'LineString' else o.coordinates)]
                merged = tracks[0].model_copy(update={'geometryType': 'MultiLineString', 'coordinates': paths,
                                                     'updatedAt': max((o.updatedAt for o in tracks if o.updatedAt), default=None)})
                overlays = [o for o in overlays if o.kind != 'track' or o.forecast != forecast] + [merged]
    return overlays


def valid_coordinates(shape: str, coordinates: Any) -> bool:
    def position(p):
        return (isinstance(p, list) and len(p) >= 2
                and all(isinstance(v, (int, float)) and not isinstance(v, bool) and isfinite(v) for v in p[:2])
                and -180 <= p[0] <= 180 and -90 <= p[1] <= 90)

    def line(points, ring=False):
        return (isinstance(points, list) and len(points) >= (4 if ring else 2)
                and all(position(p) for p in points) and (not ring or points[0][:2] == points[-1][:2]))

    def polygon(rings):
        return isinstance(rings, list) and bool(rings) and all(line(r, True) for r in rings)

    if shape == 'LineString':
        return line(coordinates)
    if shape == 'MultiLineString':
        return isinstance(coordinates, list) and bool(coordinates) and all(line(p) for p in coordinates)
    if shape == 'Polygon':
        return polygon(coordinates)
    return isinstance(coordinates, list) and bool(coordinates) and all(polygon(p) for p in coordinates)


def normalize_details(payload: Any, event: SevereEvent, timestamp) -> SevereEventDetails:
    if not isinstance(payload, dict) or not isinstance(payload.get('properties'), dict):
        raise ValueError('GDACS returned invalid event details')
    p = payload['properties']
    if str(p.get('eventid')) != event.id.split(':')[1] or p.get('eventtype') != event.eventType:
        raise ValueError('GDACS returned details for a different event')
    measurements = []

    def add(label, value, unit=''):
        if value is None or isinstance(value, (list, dict, bool)) or not str(value).strip():
            return
        measurements.append(SevereEventMeasurement(label=label, value=f'{str(value).strip()} {unit}'.strip()))

    severity = p.get('severitydata') or {}
    if event.eventType in {'DR', 'WF', 'TC'} and isinstance(severity, dict):
        v = severity.get('severity')
        if isinstance(v, (int, float)) and isfinite(v) and v > 0:
            add({'DR': 'Affected area', 'WF': 'Fire affected area', 'TC': 'Maximum wind speed'}[event.eventType], f'{v:,.1f}', severity.get('severityunit') if isinstance(severity.get('severityunit'), str) else '')
    earthquake = p.get('earthquakedetails') or {}
    if event.eventType == 'EQ' and isinstance(earthquake, dict):
        add('Magnitude', earthquake.get('magnitude'))
        add('Depth', earthquake.get('depth'), 'km')
        for key, label in [('shakepopdescription', 'ShakeMap population exposure'), ('rapidpopdescription', 'Preliminary population exposure')]:
            add(label, earthquake.get(key))
    additional = p.get('additionalinfos') or {}
    if event.eventType == 'VO' and isinstance(additional, dict):
        add('Eruption report', additional.get('eruptiondetails'))
        add('Population within 100 km', additional.get('pop100'))
        add('Volcano population exposure index', additional.get('pei'))
        add('Provider volcano VEI', additional.get('vei'))
    countries = list(dict.fromkeys(c['countryname'].strip() for c in (p.get('affectedcountries') or [])
                                   if isinstance(c, dict) and isinstance(c.get('countryname'), str) and c['countryname'].strip()))
    impacts = []
    for report in p.get('sendai', []) or []:
        if not isinstance(report, dict) or not isinstance(report.get('description'), str) or not report['description'].strip():
            continue
        impacts.append(SevereEventImpact(description=report['description'].strip(), region=report.get('region') if isinstance(report.get('region'), str) else None,
                                        reportedAt=timestamp(report.get('dateinsert')), startedAt=timestamp(report.get('onset_date')),
                                        endedAt=timestamp(report.get('expires_date'))))
    impacts.sort(key=lambda r: r.reportedAt or 0, reverse=True)
    sources = [SevereEventSource(label='GDACS event report', url=event.link)] if safe_link(event.link) else []
    documents = p.get('documents') or {}
    if isinstance(documents, dict):
        for label, url in documents.items():
            if safe_link(url):
                sources.append(SevereEventSource(label=str(label), url=url))
    return SevereEventDetails(event=event, countries=countries, provider=p.get('source') if isinstance(p.get('source'), str) else None,
                              endedAt=timestamp(p.get('todate')), measurements=measurements, impacts=impacts,
                              sources=sources, overlays=[])


def population_measurements(payload: Any, event_type: str) -> list[SevereEventMeasurement]:
    if not isinstance(payload, dict) or not isinstance(payload.get('datums'), list):
        raise ValueError('GDACS returned invalid exposure data')
    labels = {f'SUMPOP{distance}.0': f'Population within {distance} km of fire area' for distance in [1, 2, 5, 10]} if event_type == 'WF' else {'SUMPOP50.0': 'Population exposed to hurricane-force winds'}
    values = {}
    for group in payload['datums']:
        for datum in group.get('datum', []) if isinstance(group, dict) else []:
            for scalar in datum.get('scalars', {}).get('scalar', []) if isinstance(datum, dict) else []:
                if not isinstance(scalar, dict) or scalar.get('name') not in labels:
                    continue
                try:
                    value = float(scalar.get('value'))
                    if isfinite(value) and value >= 0:
                        values[scalar['name']] = f'{value:,.0f} people'
                except (ValueError, TypeError):
                    pass
    return [SevereEventMeasurement(label=labels[key], value=value) for key, value in values.items()]
