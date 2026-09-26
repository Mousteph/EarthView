from typing import List, Literal

from pydantic import BaseModel


class Satellite(BaseModel):
    id: str
    noradId: int
    name: str
    epoch: str
    meanMotion: float
    eccentricity: float
    inclination: float
    rightAscension: float
    argOfPericenter: float
    meanAnomaly: float
    bstar: float
    meanMotionDot: float
    meanMotionDdot: float
    ephemerisType: int
    classificationType: str
    elementSetNo: int
    revolutionNumber: int
    objectType: str | None = None
    operationalStatus: str | None = None
    owner: str | None = None
    ownerCode: str | None = None
    launchDate: str | None = None
    launchSite: str | None = None
    launchSiteCode: str | None = None
    internationalDesignator: str | None = None
    apogeeKm: float | None = None
    perigeeKm: float | None = None
    apsidesEstimated: bool = False
    orbitalPeriodMinutes: float | None = None
    orbitsPerDay: float | None = None
    orbitClass: str | None = None
    missionType: str | None = None
    constellation: str | None = None


class SatelliteFeed(BaseModel):
    category: str = "active"
    mode: Literal["active", "debris", "rocket_bodies"] = "active"
    fetchedAt: int
    stale: bool = False
    metadataStale: bool = False
    satellites: List[Satellite]
