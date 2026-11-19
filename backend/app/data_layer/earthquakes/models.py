from pydantic import BaseModel, Field


class Earthquake(BaseModel):
    id: str
    place: str
    lat: float
    lon: float
    magnitude: float
    location: str
    time: int
    depth: float
    sourceIds: list[str] = Field(default_factory=list)
    sourceUrl: str | None = None
    updatedAt: int | None = None
