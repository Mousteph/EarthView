from pydantic import BaseModel


class Fire(BaseModel):
    id: str
    lat: float
    lon: float
    time: int
    confidence: str | None
    frp: float | None
    satellite: str | None
    instrument: str | None
