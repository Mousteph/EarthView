from pydantic import BaseModel


class Earthquake(BaseModel):
    id: str
    place: str
    lat: float
    lon: float
    magnitude: float
    location: str
    time: int
    depth: float
