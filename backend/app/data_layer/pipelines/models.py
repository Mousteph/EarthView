from typing import List, Literal, Tuple

from pydantic import BaseModel


PipelineFuel = Literal["gas", "oil"]
PipelineType = Literal["Gas", "Oil", "NGL"]
PipelineRoute = List[Tuple[float, float]]


class Pipeline(BaseModel):
    id: str
    projectId: str
    fuel: PipelineFuel
    type: PipelineType
    name: str
    segmentName: str | None = None
    status: str | None = None
    countries: str | None = None
    owner: str | None = None
    parent: str | None = None
    operator: str | None = None
    lengthKm: float | None = None
    capacity: str | None = None
    capacityUnit: str | None = None
    startYear: str | None = None
    sourceUrl: str | None = None
    routeAccuracy: str | None = None
    routes: List[PipelineRoute]


class PipelineFeed(BaseModel):
    fuel: PipelineFuel
    dataset: str
    release: str
    source: str = "Global Energy Monitor, licensed under CC BY 4.0"
    sourceUrl: str
    fetchedAt: int
    stale: bool = False
    pipelines: List[Pipeline]
