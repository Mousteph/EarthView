from datetime import datetime, timezone
from math import isfinite, pi
from typing import Any, Dict, Set, Tuple
import enum

from .models import Satellite


class OrbitClass(enum.Enum):
    LEO = "Low Earth Orbit"
    MEO = "Medium Earth Orbit"
    HEO = "Highly Elliptical Orbit"
    GEO = "Geosynchronous Orbit"
    HEO_ALT = "High Earth Orbit"


class SatelliteNormalizer:
    EARTH_RADIUS_KM = 6378.137
    EARTH_DIAMETER_KM = 2 * EARTH_RADIUS_KM
    EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398_600.4418
    SECONDS_PER_MINUTE = 60
    MINUTES_PER_HOUR = 60
    HOURS_PER_DAY = 24
    SECONDS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE
    MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR
    TWO_PI = 2 * pi
    CUBE_ROOT_EXPONENT = 1 / 3
    PAIR_COUNT = 2
    ORBITAL_UNIT_OFFSET = 1.0
    MINIMUM_VALID_EPOCH_YEAR = 1957
    MINIMUM_NORAD_ID = 1
    NO_ELEMENT_SET_NUMBER = 0
    NO_REVOLUTION_NUMBER = 0
    MINIMUM_MEAN_MOTION = 0.0
    MINIMUM_ECCENTRICITY = 0.0
    MAXIMUM_ECCENTRICITY_EXCLUSIVE = 1.0
    MINIMUM_INCLINATION_DEGREES = 0.0
    MAXIMUM_INCLINATION_DEGREES = 180.0
    MINIMUM_ORBIT_ANGLE_DEGREES = 0.0
    MAXIMUM_ORBIT_ANGLE_DEGREES = 360.0
    SUPPORTED_EPHEMERIS_TYPE = 0
    MINIMUM_ALTITUDE_KM = 0.0
    HIGHLY_ELLIPTICAL_MINIMUM_ECCENTRICITY = 0.25
    HIGHLY_ELLIPTICAL_MINIMUM_APOGEE_KM = 2_000.0
    LOW_EARTH_ORBIT_MAXIMUM_APOGEE_KM = 2_000.0
    GEOSYNCHRONOUS_MINIMUM_MEAN_ALTITUDE_KM = 34_000.0
    GEOSYNCHRONOUS_MAXIMUM_MEAN_ALTITUDE_KM = 38_000.0
    GEOSYNCHRONOUS_MAXIMUM_APOGEE_PERIGEE_DIFFERENCE_KM = 2_000.0
    HIGH_EARTH_ORBIT_MINIMUM_APOGEE_KM = 35_786.0

    owner_names = {
        "AB": "Arab Satellite Communications Organization",
        "ABS": "Asia Broadcast Satellite",
        "AC": "Asia Satellite Telecommunications Company",
        "CA": "Canada",
        "CIS": "Commonwealth of Independent States",
        "ESA": "European Space Agency",
        "EUTE": "European Telecommunications Satellite Organization",
        "FR": "France",
        "GER": "Germany",
        "GLOB": "Globalstar",
        "IM": "International Mobile Satellite Organization",
        "IND": "India",
        "IRID": "Iridium",
        "ISRO": "Indian Space Research Organisation",
        "ISS": "International Space Station",
        "IT": "Italy",
        "ITSO": "International Telecommunications Satellite Organization",
        "JPN": "Japan",
        "O3B": "O3b Networks",
        "ORB": "ORBCOMM",
        "PRC": "People's Republic of China",
        "SEAL": "Sea Launch",
        "SES": "SES",
        "UK": "United Kingdom",
        "US": "United States",
    }

    launch_site_names = {
        "AFETR": "Air Force Eastern Test Range, Florida, USA",
        "AFWTR": "Air Force Western Test Range, California, USA",
        "ANDSP": "Andøya Spaceport, Norway",
        "ALCLC": "Alcântara Launch Center, Brazil",
        "FRGUI": "Europe's Spaceport, Kourou",
        "JSC": "Jiuquan Satellite Launch Center, China",
        "KODAK": "Kodiak Launch Complex, Alaska, USA",
        "KSCUT": "Uchinoura Space Center, Japan",
        "NSC": "Naro Space Complex, South Korea",
        "PLMSC": "Plesetsk Missile and Space Complex, Russia",
        "SEAL": "Sea Launch Platform",
        "SRILR": "Satish Dhawan Space Centre, India",
        "TAISC": "Taiyuan Satellite Launch Center, China",
        "TANSC": "Tanegashima Space Center, Japan",
        "TYMSC": "Baikonur Cosmodrome, Kazakhstan",
        "WLPIS": "Wallops Island, Virginia, USA",
        "WSC": "Wenchang Satellite Launch Site, China",
        "XICLF": "Xichang Satellite Launch Center, China",
    }

    mission_rules: Tuple[Tuple[str, Set[str]], ...] = (
        ("Earth Observation", {"LANDSAT", "SENTINEL", "WORLDVIEW", "SPOT ", "PLEIADES", "TERRA", "AQUA", "RESOURCESAT", "GAOFEN"}),
        ("Communications", {"STARLINK", "ONEWEB", "IRIDIUM", "INTELSAT", "SES ", "EUTELSAT", "GLOBALSTAR", "ORBCOMM", "O3B", "TELSTAR", "INMARSAT", "ASTRA"}),
        ("Navigation", {"GPS", "NAVSTAR", "GLONASS", "GALILEO", "BEIDOU", "COMPASS", "QZSS", "IRNSS", "NAVIC"}),
        ("Weather", {"GOES", "HIMAWARI", "METEOSAT", "WEATHER", "DMSP", "COSMIC", "NOAA ", "METOP", "FENGYUN"}),
        ("Science", {"HUBBLE", "JWST", "CHANDRA", "XMM-NEWTON", "SWIFT", "FERMI", "TESS", "KEPLER", "ASTRO", "SCIENCE", "EXPLORER"}),
        ("Space Stations", {"ISS", "TIANGONG", "MIR ", "SALYUT"}),
        ("Technology Demonstration", {"CUBESAT", "TECHNOLOGY", "DEMO", "EXPERIMENT", "PROTOTYPE"}),
        ("Data Relay", {"TDRS", "RELAY", "LUCH", "TRACKING AND DATA"}),
        ("Search and Rescue", {"COSPAS", "SARSAT"}),
        ("Military / Surveillance", {"NROL", "KH-"}),
    )

    constellations: Set[str] = {
        "STARLINK", "ONEWEB", "GPS", "NAVSTAR", "GALILEO", "BEIDOU",
        "GLONASS", "IRIDIUM", "ORBCOMM", "GLOBALSTAR",
    }


    @staticmethod
    def _number(value: Any) -> float | None:
        try:
            parsed = float(value)
            return parsed if isfinite(parsed) else None
        except (TypeError, ValueError, OverflowError):
            return None


    @classmethod
    def orbit_class(cls, apogee: float | None, perigee: float | None, eccentricity: float | None = None) -> str | None:
        if apogee is None or perigee is None:
            return None

        if eccentricity is None:
            eccentricity = (apogee - perigee) / (apogee + perigee + cls.EARTH_DIAMETER_KM)

        if eccentricity >= cls.HIGHLY_ELLIPTICAL_MINIMUM_ECCENTRICITY and apogee >= cls.HIGHLY_ELLIPTICAL_MINIMUM_APOGEE_KM:
            return OrbitClass.HEO.value

        if apogee < cls.LOW_EARTH_ORBIT_MAXIMUM_APOGEE_KM:
            return OrbitClass.LEO.value
        
        mean_altitude = (apogee + perigee) / cls.PAIR_COUNT
        if (
            cls.GEOSYNCHRONOUS_MINIMUM_MEAN_ALTITUDE_KM <= mean_altitude
            <= cls.GEOSYNCHRONOUS_MAXIMUM_MEAN_ALTITUDE_KM
            and abs(apogee - perigee) < cls.GEOSYNCHRONOUS_MAXIMUM_APOGEE_PERIGEE_DIFFERENCE_KM
        ):
            return OrbitClass.GEO.value
        
        if apogee > cls.HIGH_EARTH_ORBIT_MINIMUM_APOGEE_KM:
            return OrbitClass.HEO_ALT.value
        
        return OrbitClass.MEO.value


    @classmethod
    def infer_mission(cls, name: str) -> Tuple[str, str | None]:
        value = name.upper()

        for mission, needles in cls.mission_rules:
            if any(needle in value for needle in needles):
                constellation = next((name for name in sorted(cls.constellations) if name in value), None)
                return mission, constellation
        
        return "Other / Unclassified", None
    

    @classmethod
    def normalize_omm(cls, record: Dict[str, Any], metadata: Dict[str, Any] | None = None) -> Satellite | None:
        metadata = metadata or {}
        parsed = cls._parse_omm_record(record)
        if parsed is None:
            return None

        orbit = cls._calculate_orbit(parsed["numeric"]["meanMotion"], parsed["numeric"]["eccentricity"], metadata)
        classification = cls._map_metadata(parsed["name"], metadata)
        
        return Satellite(
            id=str(parsed["norad_id"]),
            noradId=parsed["norad_id"],
            name=parsed["name"],
            epoch=parsed["epoch"],
            **parsed["numeric"],
            ephemerisType=parsed["ephemeris_type"],
            classificationType=parsed["classification"],
            elementSetNo=parsed["element_set_no"],
            revolutionNumber=parsed["revolution_number"],
            objectType=classification["object_type"],
            operationalStatus=classification["operational_status"],
            owner=classification["owner"],
            ownerCode=classification["owner_code"],
            launchDate=classification["launch_date"],
            launchSite=classification["launch_site"],
            launchSiteCode=classification["launch_site_code"],
            internationalDesignator=metadata.get("OBJECT_ID") or record.get("OBJECT_ID") or None,
            apogeeKm=orbit["apogee"],
            perigeeKm=orbit["perigee"],
            apsidesEstimated=orbit["apsides_estimated"],
            orbitalPeriodMinutes=orbit["period_minutes"],
            orbitsPerDay=parsed["numeric"]["meanMotion"],
            orbitClass=cls.orbit_class(orbit["apogee"], orbit["perigee"], parsed["numeric"]["eccentricity"]),
            missionType=classification["mission"],
            constellation=classification["constellation"],
        )


    @classmethod
    def _parse_omm_record(cls, record: Dict[str, Any]) -> Dict[str, Any] | None:
        try:
            name = record["OBJECT_NAME"].strip()
            epoch = cls._normalize_epoch(record["EPOCH"])
            if epoch is None:
                return None

            numeric = {
                "meanMotion": float(record["MEAN_MOTION"]),
                "eccentricity": float(record["ECCENTRICITY"]),
                "inclination": float(record["INCLINATION"]),
                "rightAscension": float(record["RA_OF_ASC_NODE"]),
                "argOfPericenter": float(record["ARG_OF_PERICENTER"]),
                "meanAnomaly": float(record["MEAN_ANOMALY"]),
                "bstar": float(record["BSTAR"]),
                "meanMotionDot": float(record["MEAN_MOTION_DOT"]),
                "meanMotionDdot": float(record["MEAN_MOTION_DDOT"]),
            }

            norad_id = int(record["NORAD_CAT_ID"])
            ephemeris_type = int(record.get("EPHEMERIS_TYPE", cls.SUPPORTED_EPHEMERIS_TYPE))
            element_set_no = int(record.get("ELEMENT_SET_NO", cls.NO_ELEMENT_SET_NUMBER))
            revolution_number = int(record.get("REV_AT_EPOCH", cls.NO_REVOLUTION_NUMBER))
            classification = str(record.get("CLASSIFICATION_TYPE", "U")).strip() or "U"
        
        except (KeyError, TypeError, ValueError, OverflowError, AttributeError):
            return None

        if not cls._is_valid_omm_record(norad_id, name, numeric, ephemeris_type):
            return None

        return {
            "norad_id": norad_id,
            "name": name,
            "epoch": epoch,
            "numeric": numeric,
            "ephemeris_type": ephemeris_type,
            "element_set_no": element_set_no,
            "revolution_number": revolution_number,
            "classification": classification,
        }


    @classmethod
    def _normalize_epoch(cls, epoch: Any) -> str | None:
        if not isinstance(epoch, str):
            return None

        try:
            parsed = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(timezone.utc)
            
            if parsed.year < cls.MINIMUM_VALID_EPOCH_YEAR:
                return None
        
            return parsed.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        
        except (ValueError, OverflowError):
            return None


    @classmethod
    def _is_valid_omm_record(cls, norad_id: int, name: str, numeric: Dict[str, float], ephemeris_type: int) -> bool:
        if norad_id < cls.MINIMUM_NORAD_ID or not name or not all(isfinite(value) for value in numeric.values()):
            return False

        if numeric["meanMotion"] <= cls.MINIMUM_MEAN_MOTION:
            return False
        
        if not cls.MINIMUM_ECCENTRICITY <= numeric["eccentricity"] < cls.MAXIMUM_ECCENTRICITY_EXCLUSIVE:
            return False
        
        if not cls.MINIMUM_INCLINATION_DEGREES <= numeric["inclination"] <= cls.MAXIMUM_INCLINATION_DEGREES:
            return False
        
        if ephemeris_type != cls.SUPPORTED_EPHEMERIS_TYPE:
            return False
        
        angle_fields = ("rightAscension", "argOfPericenter", "meanAnomaly")
        
        return all(
            cls.MINIMUM_ORBIT_ANGLE_DEGREES <= numeric[field] <= cls.MAXIMUM_ORBIT_ANGLE_DEGREES
            for field in angle_fields
        )


    @classmethod
    def _calculate_orbit(cls, mean_motion: float, eccentricity: float, metadata: Dict[str, Any]) -> Dict[str, Any]:
        period_minutes = cls.MINUTES_PER_DAY / mean_motion
        mean_motion_radians_per_second = mean_motion * cls.TWO_PI / cls.SECONDS_PER_DAY
        mean_motion_squared = mean_motion_radians_per_second * mean_motion_radians_per_second
        semi_major_axis_km = (cls.EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 / mean_motion_squared) ** cls.CUBE_ROOT_EXPONENT
        apogee = cls._number(metadata.get("APOGEE"))
        perigee = cls._number(metadata.get("PERIGEE"))
        apsides_estimated = apogee is None or perigee is None
        
        if apogee is None:
            apogee = max(
                cls.MINIMUM_ALTITUDE_KM,
                semi_major_axis_km * (cls.ORBITAL_UNIT_OFFSET + eccentricity) - cls.EARTH_RADIUS_KM,
            )

        if perigee is None:
            perigee = max(
                cls.MINIMUM_ALTITUDE_KM,
                semi_major_axis_km * (cls.ORBITAL_UNIT_OFFSET - eccentricity) - cls.EARTH_RADIUS_KM,
            )

        return {
            "period_minutes": period_minutes,
            "apogee": apogee,
            "perigee": perigee,
            "apsides_estimated": apsides_estimated,
        }


    @classmethod
    def _map_metadata(cls, name: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        status_code = (metadata.get("OPS_STATUS_CODE") or "").strip().upper()
        operational_status = None
        if status_code in {"+", "P", "B", "S", "X"}:
            operational_status = "active"
        elif status_code in {"-", "D"}:
            operational_status = "inactive"
        
        mission, constellation = cls.infer_mission(name)
        owner_code = (metadata.get("OWNER") or "").strip() or None
        launch_code = (metadata.get("LAUNCH_SITE") or "").strip() or None
        
        object_type = {
            "PAY": "Payload",
            "DEB": "Debris",
            "R/B": "Rocket body"
        }.get(metadata.get("OBJECT_TYPE"))
        
        return {
            "mission": mission,
            "constellation": constellation,
            "object_type": object_type,
            "operational_status": operational_status,
            "owner": cls.owner_names.get(owner_code, owner_code),
            "owner_code": owner_code,
            "launch_date": metadata.get("LAUNCH_DATE") or None,
            "launch_site": cls.launch_site_names.get(launch_code, launch_code),
            "launch_site_code": launch_code,
        }


    @staticmethod
    def to_omm_record(satellite: Satellite) -> Dict[str, Any]:
        return {
            "OBJECT_NAME": satellite.name,
            "OBJECT_ID": satellite.internationalDesignator,
            "NORAD_CAT_ID": satellite.noradId,
            "EPOCH": satellite.epoch,
            "MEAN_MOTION": satellite.meanMotion,
            "ECCENTRICITY": satellite.eccentricity,
            "INCLINATION": satellite.inclination,
            "RA_OF_ASC_NODE": satellite.rightAscension,
            "ARG_OF_PERICENTER": satellite.argOfPericenter,
            "MEAN_ANOMALY": satellite.meanAnomaly,
            "BSTAR": satellite.bstar,
            "MEAN_MOTION_DOT": satellite.meanMotionDot,
            "MEAN_MOTION_DDOT": satellite.meanMotionDdot,
            "EPHEMERIS_TYPE": satellite.ephemerisType,
            "CLASSIFICATION_TYPE": satellite.classificationType,
            "ELEMENT_SET_NO": satellite.elementSetNo,
            "REV_AT_EPOCH": satellite.revolutionNumber,
        }
