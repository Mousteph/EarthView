"""Earthquake matching metadata from GDACS summary/detail responses."""
import re
from math import isfinite
from urllib.parse import urlparse
from .models import SevereEarthquake


def number(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if isfinite(result) else None
    except (TypeError, ValueError, OverflowError):
        return None


def normalize_earthquake(properties: dict) -> SevereEarthquake:
    details = properties.get('earthquakedetails')
    details = details if isinstance(details, dict) else {}
    severity = properties.get('severitydata')
    severity = severity if isinstance(severity, dict) else {}
    magnitude = number(details.get('magnitude'))
    if magnitude is None:
        magnitude = number(severity.get('severity'))
    depth = number(details.get('depth'))
    if depth is None:
        match = re.search(r'Depth:\s*([0-9.]+)\s*km', str(severity.get('severitytext', '')), re.I)
        depth = number(match.group(1)) if match else None
    identifiers = []
    source_id = properties.get('sourceid')
    # The inspected NEIC detail response supplies its USGS event ID here.
    if str(properties.get('source', '')).upper() in {'NEIC', 'USGS'} and isinstance(source_id, str) and re.fullmatch(r'[a-z]{2}[a-zA-Z0-9]+', source_id):
        identifiers.append(source_id)
    documents = properties.get('documents')
    for value in documents.values() if isinstance(documents, dict) else []:
        if not isinstance(value, str):
            continue
        link = urlparse(value)
        match = re.fullmatch(r'/earthquakes/eventpage/([a-zA-Z0-9]+)(?:/.*)?', link.path)
        if link.scheme == 'https' and link.hostname == 'earthquake.usgs.gov' and match:
            identifiers.append(match.group(1))
    identifiers = list(dict.fromkeys(identifiers))
    return SevereEarthquake(magnitude=magnitude, depth=depth, sourceIds=identifiers,
                           sourceUrl=f'https://earthquake.usgs.gov/earthquakes/eventpage/{identifiers[0]}' if identifiers else None)
