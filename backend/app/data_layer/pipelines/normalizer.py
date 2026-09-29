import math
import re
from typing import Any, Dict, List

from .models import Pipeline, PipelineFuel, PipelineRoute, PipelineType


class PipelineNormalizer:
    @classmethod
    def normalize_feature(cls, feature: Any, fuel: PipelineFuel) -> Pipeline | None:
        if not isinstance(feature, dict):
            return None
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            return None

        project_id = cls._text(properties.get("ProjectID")) or cls._text(feature.get("id"))
        if not project_id:
            return None

        routes = cls._routes(geometry)
        if not routes:
            return None

        source_type = cls._text(properties.get("Fuel")) or ""
        pipeline_type: PipelineType = "Gas" if fuel == "gas" else "NGL" if re.search(r"\bNGL\b", source_type, re.IGNORECASE) else "Oil"
        name = cls._text(properties.get("PipelineName")) or cls._text(properties.get("Name")) or f"Pipeline {project_id}"

        return Pipeline(
            id=f"{fuel}:{project_id}",
            projectId=project_id,
            fuel=fuel,
            type=pipeline_type,
            name=name,
            segmentName=cls._text(properties.get("SegmentName")),
            status=cls._text(properties.get("Status")),
            countries=cls._text(properties.get("CountriesOrAreas")),
            owner=cls._text(properties.get("Owner")),
            parent=cls._text(properties.get("Parent")),
            operator=cls._text(properties.get("Operator")),
            lengthKm=cls._number(properties.get("LengthKnownKm")) or cls._number(properties.get("LengthEstimateKm")),
            capacity=cls._text(properties.get("Capacity")),
            capacityUnit=cls._text(properties.get("CapacityUnits")),
            startYear=cls._text(properties.get("StartYear1")),
            sourceUrl=cls._http_url(properties.get("Wiki")),
            routeAccuracy=cls._text(properties.get("RouteAccuracy")),
            routes=routes,
        )

    @classmethod
    def normalize_collection(cls, payload: Dict[str, Any], fuel: PipelineFuel) -> List[Pipeline]:
        features = payload.get("features")
        if not isinstance(features, list):
            raise ValueError("GEM returned an invalid pipeline feature list")
        pipelines = [pipeline for feature in features if (pipeline := cls.normalize_feature(feature, fuel)) is not None]
        if not pipelines:
            raise ValueError("GEM returned no pipelines with usable routes")
        return pipelines

    @classmethod
    def _routes(cls, geometry: Dict[str, Any]) -> List[PipelineRoute]:
        geometry_type = geometry.get("type")
        coordinates = geometry.get("coordinates")
        if geometry_type == "LineString":
            candidates = [coordinates]
        elif geometry_type == "MultiLineString":
            candidates = coordinates
        else:
            return []
        if not isinstance(candidates, list):
            return []

        routes: List[PipelineRoute] = []
        for candidate in candidates:
            if not isinstance(candidate, list) or len(candidate) < 2:
                continue
            route: PipelineRoute = []
            for position in candidate:
                if not isinstance(position, (list, tuple)) or len(position) < 2:
                    return []
                try:
                    longitude, latitude = float(position[0]), float(position[1])
                except (TypeError, ValueError, OverflowError):
                    return []
                if not (math.isfinite(longitude) and math.isfinite(latitude) and -180 <= longitude <= 180 and -90 <= latitude <= 90):
                    return []
                route.append((longitude, latitude))
            routes.append(route)
        return routes

    @staticmethod
    def _text(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @classmethod
    def _number(cls, value: Any) -> float | None:
        text = cls._text(value)
        if text is None:
            return None
        try:
            number = float(text.replace(",", ""))
        except (TypeError, ValueError, OverflowError):
            return None
        return number if math.isfinite(number) and number >= 0 else None

    @staticmethod
    def _http_url(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        url = value.strip()
        return url if url.startswith(("https://", "http://")) else None
