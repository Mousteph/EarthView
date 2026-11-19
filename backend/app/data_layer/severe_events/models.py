from typing import Literal

from pydantic import BaseModel, Field


class SevereEarthquake(BaseModel):
    magnitude: float | None = None
    depth: float | None = None
    sourceIds: list[str] = Field(default_factory=list)
    sourceUrl: str | None = None


class SevereEventCategory(BaseModel):
    id: str
    title: str


class SevereEvent(BaseModel):
    id: str
    eventType: Literal["EQ", "FL", "TC", "VO", "WF", "DR"]
    episodeId: int | None = None
    title: str
    description: str | None
    link: str | None
    categories: list[SevereEventCategory]
    lat: float
    lon: float
    alertLevel: Literal["Green", "Orange", "Red"] | None
    severity: str | None
    country: str | None
    startedAt: int
    updatedAt: int
    earthquake: SevereEarthquake | None = None


class SevereEventOverlay(BaseModel):
    eventId: str
    episodeId: int | None = None
    kind: Literal['track', 'drought-area', 'wind-zone', 'uncertainty', 'flood-area', 'fire-area', 'shaking']
    label: str
    geometryType: Literal['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']
    coordinates: list[list[float]] | list[list[list[float]]] | list[list[list[list[float]]]]
    forecast: bool = False
    updatedAt: int | None = None
    value: float | None = None
    unit: str | None = None


class SevereEventOverlayFeed(BaseModel):
    overlays: list[SevereEventOverlay]
    unavailable: list[str] = []


class SevereEventMeasurement(BaseModel):
    label: str
    value: str


class SevereEventImpact(BaseModel):
    description: str
    region: str | None = None
    reportedAt: int | None = None
    startedAt: int | None = None
    endedAt: int | None = None


class SevereEventSource(BaseModel):
    label: str
    url: str


class SevereEventDetails(BaseModel):
    event: SevereEvent
    countries: list[str]
    provider: str | None = None
    endedAt: int | None = None
    measurements: list[SevereEventMeasurement]
    impacts: list[SevereEventImpact]
    sources: list[SevereEventSource]
    overlays: list[SevereEventOverlay]
    geometryUnavailable: bool = False
