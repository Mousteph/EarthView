import asyncio
import csv
import io
import json
import os
import time
from datetime import datetime, timezone
from math import isfinite
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel

CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"
CELESTRAK_SATCAT_URL = "https://celestrak.org/pub/satcat.csv"
SUCCESS_TTL_SECONDS = 2 * 60 * 60 + 5 * 60
MAX_STALE_SECONDS = 24 * 60 * 60
SATCAT_TTL_SECONDS = 24 * 60 * 60
SATCAT_MAX_STALE_SECONDS = 7 * 24 * 60 * 60
INITIAL_FAILURE_BACKOFF_SECONDS = 15 * 60
MAX_FAILURE_BACKOFF_SECONDS = 6 * 60 * 60
CATEGORY_GROUPS = {"active": "active"}
MODES = {"satellites": "active", "debris": "DEB", "rocket_bodies": "R/B"}
CACHE_PATH = Path(__file__).resolve().parents[2] / ".cache" / "satellites_active.json"
SATCAT_CACHE_PATH = Path(__file__).resolve().parents[2] / ".cache" / "satcat.json"


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
    mode: str = "satellites"
    fetchedAt: int
    stale: bool = False
    metadataStale: bool = False
    satellites: list[Satellite]


_cache_lock = asyncio.Lock()
_cached_feeds: dict[str, SatelliteFeed | None] = {mode: None for mode in MODES}
_next_attempts: dict[str, float] = {mode: 0.0 for mode in MODES}
_failure_counts: dict[str, int] = {mode: 0 for mode in MODES}
_loaded_modes: set[str] = set()
_satcat: dict[int, dict[str, Any]] = {}
_satcat_fetched_at = 0
_satcat_next_attempt_at = 0.0
_satcat_loaded = False


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
        return parsed if isfinite(parsed) else None
    except (TypeError, ValueError, OverflowError):
        return None


def orbit_class(apogee: float | None, perigee: float | None, eccentricity: float | None = None) -> str | None:
    if apogee is None or perigee is None:
        return None
    if eccentricity is None:
        eccentricity = (apogee - perigee) / (apogee + perigee + 2 * 6378.137)
    if eccentricity >= 0.25 and apogee >= 2_000:
        return "Highly Elliptical Orbit"
    mean_altitude = (apogee + perigee) / 2
    if apogee < 2_000:
        return "Low Earth Orbit"
    if 34_000 <= mean_altitude <= 38_000 and abs(apogee - perigee) < 2_000:
        return "Geosynchronous Orbit"
    if apogee > 35_786:
        return "High Earth Orbit"
    return "Medium Earth Orbit"


def infer_mission(name: str) -> tuple[str, str | None]:
    value = name.upper()
    rules = (
        ("Earth Observation", ("LANDSAT", "SENTINEL", "WORLDVIEW", "SPOT ", "PLEIADES", "TERRA", "AQUA", "RESOURCESAT", "GAOFEN")),
        ("Communications", ("STARLINK", "ONEWEB", "IRIDIUM", "INTELSAT", "SES ", "EUTELSAT", "GLOBALSTAR", "ORBCOMM", "O3B", "TELSTAR", "INMARSAT", "ASTRA")),
        ("Navigation", ("GPS", "NAVSTAR", "GLONASS", "GALILEO", "BEIDOU", "COMPASS", "QZSS", "IRNSS", "NAVIC")),
        ("Weather", ("GOES", "HIMAWARI", "METEOSAT", "WEATHER", "DMSP", "COSMIC", "NOAA ", "METOP", "FENGYUN")),
        ("Science", ("HUBBLE", "JWST", "CHANDRA", "XMM-NEWTON", "SWIFT", "FERMI", "TESS", "KEPLER", "ASTRO", "SCIENCE", "EXPLORER")),
        ("Space Stations", ("ISS", "TIANGONG", "MIR ", "SALYUT")),
        ("Technology Demonstration", ("CUBESAT", "TECHNOLOGY", "DEMO", "EXPERIMENT", "PROTOTYPE")),
        ("Data Relay", ("TDRS", "RELAY", "LUCH", "TRACKING AND DATA")),
        ("Search and Rescue", ("COSPAS", "SARSAT")),
        ("Military / Surveillance", ("NROL", "KH-")),
    )
    for mission, needles in rules:
        if any(needle in value for needle in needles):
            constellation = next((label for needle, label in (("STARLINK", "Starlink"), ("ONEWEB", "OneWeb"), ("GPS", "GPS"), ("NAVSTAR", "GPS"), ("GALILEO", "Galileo"), ("BEIDOU", "BeiDou"), ("GLONASS", "GLONASS"), ("IRIDIUM", "Iridium"), ("ORBCOMM", "ORBCOMM"), ("GLOBALSTAR", "Globalstar")) if needle in value), None)
            return mission, constellation
    return "Other / Unclassified", None


def normalize_omm(record: dict[str, Any], metadata: dict[str, Any] | None = None) -> Satellite | None:
    metadata = metadata or {}
    try:
        norad_id = int(record["NORAD_CAT_ID"])
        name = record["OBJECT_NAME"].strip()
        epoch = record["EPOCH"]
        if not isinstance(epoch, str):
            return None
        parsed_epoch = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
        if parsed_epoch.tzinfo is not None:
            parsed_epoch = parsed_epoch.astimezone(timezone.utc)
        if parsed_epoch.year < 1957:
            return None
        epoch = parsed_epoch.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        numeric = {
            "meanMotion": float(record["MEAN_MOTION"]), "eccentricity": float(record["ECCENTRICITY"]),
            "inclination": float(record["INCLINATION"]), "rightAscension": float(record["RA_OF_ASC_NODE"]),
            "argOfPericenter": float(record["ARG_OF_PERICENTER"]), "meanAnomaly": float(record["MEAN_ANOMALY"]),
            "bstar": float(record["BSTAR"]), "meanMotionDot": float(record["MEAN_MOTION_DOT"]),
            "meanMotionDdot": float(record["MEAN_MOTION_DDOT"]),
        }
        ephemeris_type = int(record.get("EPHEMERIS_TYPE", 0))
        element_set_no = int(record.get("ELEMENT_SET_NO", 0))
        revolution_number = int(record.get("REV_AT_EPOCH", 0))
        classification = str(record.get("CLASSIFICATION_TYPE", "U")).strip() or "U"
    except (KeyError, TypeError, ValueError, OverflowError, AttributeError):
        return None
    if norad_id <= 0 or not name or not all(isfinite(value) for value in numeric.values()):
        return None
    if numeric["meanMotion"] <= 0 or not 0 <= numeric["eccentricity"] < 1 or not 0 <= numeric["inclination"] <= 180:
        return None
    if any(not 0 <= numeric[field] <= 360 for field in ("rightAscension", "argOfPericenter", "meanAnomaly")) or ephemeris_type != 0:
        return None

    mean_motion = numeric["meanMotion"]
    period = 1440 / mean_motion
    mean_motion_rad_s = mean_motion * 2 * 3.141592653589793 / 86_400
    semi_major_axis_km = (398_600.4418 / mean_motion_rad_s ** 2) ** (1 / 3)
    eccentricity = numeric["eccentricity"]
    apogee = _number(metadata.get("APOGEE"))
    perigee = _number(metadata.get("PERIGEE"))
    apsides_estimated = apogee is None or perigee is None
    if apogee is None:
        apogee = max(0.0, semi_major_axis_km * (1 + eccentricity) - 6378.137)
    if perigee is None:
        perigee = max(0.0, semi_major_axis_km * (1 - eccentricity) - 6378.137)
    mission, constellation = infer_mission(name)
    object_type = {"PAY": "Payload", "DEB": "Debris", "R/B": "Rocket body"}.get(metadata.get("OBJECT_TYPE"))
    status_code = (metadata.get("OPS_STATUS_CODE") or "").strip().upper()
    operational_status = "active" if status_code in {"+", "P", "B", "S", "X"} else "inactive" if status_code in {"-", "D"} else None
    owner_code = (metadata.get("OWNER") or "").strip() or None
    launch_code = (metadata.get("LAUNCH_SITE") or "").strip() or None
    owner_names = {"AB": "Arab Satellite Communications Organization", "ABS": "Asia Broadcast Satellite", "AC": "Asia Satellite Telecommunications Company", "CA": "Canada", "CIS": "Commonwealth of Independent States", "ESA": "European Space Agency", "EUTE": "European Telecommunications Satellite Organization", "FR": "France", "GER": "Germany", "GLOB": "Globalstar", "IM": "International Mobile Satellite Organization", "IND": "India", "IRID": "Iridium", "ISRO": "Indian Space Research Organisation", "ISS": "International Space Station", "IT": "Italy", "ITSO": "International Telecommunications Satellite Organization", "JPN": "Japan", "O3B": "O3b Networks", "ORB": "ORBCOMM", "PRC": "People's Republic of China", "SEAL": "Sea Launch", "SES": "SES", "UK": "United Kingdom", "US": "United States"}
    launch_names = {"AFETR": "Air Force Eastern Test Range, Florida, USA", "AFWTR": "Air Force Western Test Range, California, USA", "ANDSP": "Andøya Spaceport, Norway", "ALCLC": "Alcântara Launch Center, Brazil", "FRGUI": "Europe's Spaceport, Kourou", "JSC": "Jiuquan Satellite Launch Center, China", "KODAK": "Kodiak Launch Complex, Alaska, USA", "KSCUT": "Uchinoura Space Center, Japan", "NSC": "Naro Space Complex, South Korea", "PLMSC": "Plesetsk Missile and Space Complex, Russia", "SEAL": "Sea Launch Platform", "SRILR": "Satish Dhawan Space Centre, India", "TAISC": "Taiyuan Satellite Launch Center, China", "TANSC": "Tanegashima Space Center, Japan", "TYMSC": "Baikonur Cosmodrome, Kazakhstan", "WLPIS": "Wallops Island, Virginia, USA", "WSC": "Wenchang Satellite Launch Site, China", "XICLF": "Xichang Satellite Launch Center, China"}
    return Satellite(
        id=str(norad_id), noradId=norad_id, name=name, epoch=epoch, **numeric,
        ephemerisType=ephemeris_type, classificationType=classification, elementSetNo=element_set_no,
        revolutionNumber=revolution_number, objectType=object_type, operationalStatus=operational_status,
        owner=owner_names.get(owner_code, owner_code), ownerCode=owner_code,
        launchDate=metadata.get("LAUNCH_DATE") or None, launchSite=launch_names.get(launch_code, launch_code),
        launchSiteCode=launch_code, internationalDesignator=metadata.get("OBJECT_ID") or record.get("OBJECT_ID") or None,
        apogeeKm=apogee, perigeeKm=perigee, apsidesEstimated=apsides_estimated,
        orbitalPeriodMinutes=period, orbitsPerDay=mean_motion,
        orbitClass=orbit_class(apogee, perigee, eccentricity), missionType=mission, constellation=constellation,
    )


def _cached_omm(satellite: Satellite) -> dict[str, Any]:
    return {
        "OBJECT_NAME": satellite.name, "OBJECT_ID": satellite.internationalDesignator,
        "NORAD_CAT_ID": satellite.noradId, "EPOCH": satellite.epoch,
        "MEAN_MOTION": satellite.meanMotion, "ECCENTRICITY": satellite.eccentricity,
        "INCLINATION": satellite.inclination, "RA_OF_ASC_NODE": satellite.rightAscension,
        "ARG_OF_PERICENTER": satellite.argOfPericenter, "MEAN_ANOMALY": satellite.meanAnomaly,
        "BSTAR": satellite.bstar, "MEAN_MOTION_DOT": satellite.meanMotionDot,
        "MEAN_MOTION_DDOT": satellite.meanMotionDdot, "EPHEMERIS_TYPE": satellite.ephemerisType,
        "CLASSIFICATION_TYPE": satellite.classificationType, "ELEMENT_SET_NO": satellite.elementSetNo,
        "REV_AT_EPOCH": satellite.revolutionNumber,
    }


async def _upgrade_cached_feed(feed: SatelliteFeed) -> SatelliteFeed:
    try:
        metadata = await _ensure_satcat()
    except (httpx.HTTPError, ValueError):
        metadata = {}
    upgraded = [normalize_omm(_cached_omm(item), metadata.get(item.noradId)) or item for item in feed.satellites]
    if feed.mode == "satellites":
        upgraded = [item.model_copy(update={"operationalStatus": "active"}) if item.operationalStatus is None else item for item in upgraded]
    metadata_stale = not _satcat_fetched_at or time.time() - _satcat_fetched_at / 1000 >= SATCAT_TTL_SECONDS
    return feed.model_copy(update={"satellites": upgraded, "metadataStale": metadata_stale})


def _cache_path(mode: str) -> Path:
    return CACHE_PATH if mode == "satellites" else CACHE_PATH.with_name(f"satellites_{mode}.json")


def _read_feed_cache(path: Path, mode: str) -> tuple[SatelliteFeed | None, float, int]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        feed = SatelliteFeed.model_validate(payload.get("feed")) if payload.get("feed") is not None else None
        if feed and feed.mode != mode:
            return None, 0.0, 0
        return feed, float(payload.get("nextAttemptAt", 0)), int(payload.get("failureCount", 0))
    except (OSError, ValueError, TypeError, KeyError):
        return None, 0.0, 0


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload), encoding="utf-8")
    os.replace(temporary, path)


def _read_satcat() -> tuple[dict[int, dict[str, Any]], int, float]:
    try:
        payload = json.loads(SATCAT_CACHE_PATH.read_text(encoding="utf-8"))
        records = {int(key): value for key, value in payload.get("records", {}).items()}
        return records, int(payload.get("fetchedAt", 0)), float(payload.get("nextAttemptAt", 0))
    except (OSError, ValueError, TypeError, KeyError):
        return {}, 0, 0.0


async def _fetch_satcat() -> tuple[dict[int, dict[str, Any]], int]:
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.get(CELESTRAK_SATCAT_URL)
        response.raise_for_status()
    records: dict[int, dict[str, Any]] = {}
    for row in csv.DictReader(io.StringIO(response.text)):
        try:
            records[int(row["NORAD_CAT_ID"])] = row
        except (KeyError, TypeError, ValueError):
            continue
    if not records:
        raise ValueError("CelesTrak returned no valid SATCAT records")
    fetched_at = int(time.time() * 1000)
    _write_json(SATCAT_CACHE_PATH, {"fetchedAt": fetched_at, "nextAttemptAt": fetched_at / 1000 + SATCAT_TTL_SECONDS, "records": records})
    return records, fetched_at


async def _ensure_satcat() -> dict[int, dict[str, Any]]:
    global _satcat, _satcat_fetched_at, _satcat_next_attempt_at, _satcat_loaded
    now = time.time()
    if not _satcat_loaded:
        _satcat, _satcat_fetched_at, _satcat_next_attempt_at = _read_satcat()
        _satcat_loaded = True
    if _satcat and now < _satcat_next_attempt_at:
        if now - _satcat_fetched_at / 1000 <= SATCAT_MAX_STALE_SECONDS:
            return _satcat
        raise httpx.HTTPError("SATCAT metadata cache has expired")
    if _satcat and now - _satcat_fetched_at / 1000 < SATCAT_TTL_SECONDS:
        return _satcat
    try:
        _satcat, _satcat_fetched_at = await _fetch_satcat()
        _satcat_next_attempt_at = _satcat_fetched_at / 1000 + SATCAT_TTL_SECONDS
    except (httpx.HTTPError, ValueError):
        _satcat_next_attempt_at = now + SATCAT_TTL_SECONDS
        if _satcat:
            _write_json(SATCAT_CACHE_PATH, {"fetchedAt": _satcat_fetched_at, "nextAttemptAt": _satcat_next_attempt_at, "records": _satcat})
        if _satcat and now - _satcat_fetched_at / 1000 <= SATCAT_MAX_STALE_SECONDS:
            return _satcat
        raise
    return _satcat


async def _fetch_upstream(category: str) -> list[Satellite]:
    if category not in CATEGORY_GROUPS:
        raise ValueError("Unsupported satellite category")
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(CELESTRAK_GP_URL, params={"GROUP": CATEGORY_GROUPS[category], "FORMAT": "JSON"})
        response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("CelesTrak returned an invalid satellite feed")
    try:
        metadata = await _ensure_satcat()
    except (httpx.HTTPError, ValueError):
        metadata = {}
    satellites = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            norad_id = int(item.get("NORAD_CAT_ID", 0))
        except (TypeError, ValueError):
            norad_id = 0
        normalized = normalize_omm(item, metadata.get(norad_id))
        if normalized is not None:
            if normalized.operationalStatus is None:
                normalized = normalized.model_copy(update={"operationalStatus": "active"})
            satellites.append(normalized)
    if not satellites:
        raise ValueError("CelesTrak returned no valid satellite records")
    return satellites


async def _fetch_mode_upstream(mode: str) -> list[Satellite]:
    if mode == "satellites":
        return await _fetch_upstream("active")
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(CELESTRAK_GP_URL, params={"NAME": MODES[mode], "FORMAT": "JSON"})
        response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("CelesTrak returned an invalid orbital-object feed")
    metadata = await _ensure_satcat()
    expected_type = "DEB" if mode == "debris" else "R/B"
    records = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            satcat = metadata.get(int(item.get("NORAD_CAT_ID", 0)))
        except (TypeError, ValueError):
            satcat = None
        if not satcat or satcat.get("OBJECT_TYPE") != expected_type:
            continue
        if satcat.get("DECAY_DATE") or satcat.get("ORBIT_CENTER") not in (None, "", "EA") or satcat.get("ORBIT_TYPE") not in (None, "", "ORB"):
            continue
        normalized = normalize_omm(item, satcat)
        if normalized:
            records.append(normalized)
    if not records:
        raise ValueError("CelesTrak returned no valid orbital-object records")
    return records


async def fetch_satellites(mode: str = "satellites") -> SatelliteFeed:
    if mode == "active":
        mode = "satellites"
    if mode not in MODES:
        raise ValueError("Unsupported satellite mode")
    async with _cache_lock:
        now = time.time()
        if mode not in _loaded_modes:
            cached, next_attempt, failures = _read_feed_cache(_cache_path(mode), mode)
            if cached and any(item.orbitalPeriodMinutes is None or item.missionType is None for item in cached.satellites):
                cached = await _upgrade_cached_feed(cached)
                _write_json(_cache_path(mode), {"feed": cached.model_dump(), "nextAttemptAt": next_attempt, "failureCount": failures})
            _cached_feeds[mode], _next_attempts[mode], _failure_counts[mode] = cached, next_attempt, failures
            _loaded_modes.add(mode)
        cached = _cached_feeds[mode]
        if cached and now - cached.fetchedAt / 1000 < SUCCESS_TTL_SECONDS:
            return cached.model_copy(update={"stale": False})
        if now < _next_attempts[mode]:
            if cached and now - cached.fetchedAt / 1000 <= MAX_STALE_SECONDS:
                return cached.model_copy(update={"stale": True})
            raise httpx.HTTPError("Satellite data refresh is backing off or cache has expired")
        try:
            records = await _fetch_mode_upstream(mode)
        except (httpx.HTTPError, ValueError):
            _failure_counts[mode] += 1
            _next_attempts[mode] = now + min(INITIAL_FAILURE_BACKOFF_SECONDS * 2 ** (_failure_counts[mode] - 1), MAX_FAILURE_BACKOFF_SECONDS)
            path = _cache_path(mode)
            _write_json(path, {"feed": cached.model_dump() if cached else None, "nextAttemptAt": _next_attempts[mode], "failureCount": _failure_counts[mode]})
            if cached and now - cached.fetchedAt / 1000 <= MAX_STALE_SECONDS:
                return cached.model_copy(update={"stale": True})
            raise
        fetched_at = int(time.time() * 1000)
        metadata_stale = _satcat_fetched_at == 0 or fetched_at / 1000 - _satcat_fetched_at / 1000 >= SATCAT_TTL_SECONDS
        feed = SatelliteFeed(category="active", mode=mode, fetchedAt=fetched_at, metadataStale=metadata_stale, satellites=records)
        _cached_feeds[mode] = feed
        _failure_counts[mode] = 0
        _next_attempts[mode] = fetched_at / 1000 + SUCCESS_TTL_SECONDS
        _write_json(_cache_path(mode), {"feed": feed.model_dump(), "nextAttemptAt": _next_attempts[mode], "failureCount": 0})
        return feed
