"""Prepare compact Natural Earth country and city label records."""

from __future__ import annotations

import json
from pathlib import Path

import shapefile


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data/source-assets/natural-earth"
COUNTRIES = ROOT / "frontend/public/data/natural-earth/ne_10m_admin_0_countries.geojson"
PLACES = SOURCE_DIR / "ne_10m_populated_places.zip"
LABEL_OUTPUT = ROOT / "frontend/public/data/natural-earth/earth-labels.json"


def main() -> None:
    LABEL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    LABEL_OUTPUT.write_text(json.dumps(build_labels(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {LABEL_OUTPUT}")


def build_labels() -> dict[str, list[dict[str, object]]]:
    country_document = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    countries = []
    for feature in country_document["features"]:
        properties = feature["properties"]
        try:
            longitude = float(properties["LABEL_X"])
            latitude = float(properties["LABEL_Y"])
            rank = int(properties["LABELRANK"])
        except (KeyError, TypeError, ValueError):
            continue
        name = properties.get("NAME")
        if not isinstance(name, str) or not name:
            continue
        countries.append({
            "id": f"country:{properties.get('ADM0_A3', name)}",
            "name": name,
            "longitude": longitude,
            "latitude": latitude,
            "kind": "country",
            "rank": rank,
        })

    places = shapefile.Reader(str(PLACES))
    cities = []
    for record in places.iterRecords():
        values = record.as_dict()
        rank = int(values["SCALERANK"])
        capital = bool(values["ADM0CAP"])
        if rank > 5 and not capital:
            continue
        name = values["NAME"]
        longitude = float(values["LONGITUDE"])
        latitude = float(values["LATITUDE"])
        population = int(values["POP_MAX"] or 0)
        if not name or not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            continue
        cities.append({
            "id": f"city:{values['NE_ID']}",
            "name": name,
            "longitude": longitude,
            "latitude": latitude,
            "kind": "city",
            "rank": rank,
            "population": population,
            "capital": capital,
        })

    return {"countries": countries, "cities": cities}


if __name__ == "__main__":
    main()
