"""
risk_scorer.py
--------------
Calculates a risk score (0.0 – 1.0) for a road segment or coordinate
based on three factors:
  1. Accident density  – how many past accidents occurred nearby
  2. Time of day       – certain hours are statistically more dangerous
  3. Road type         – highways vs urban vs rural carry different base risks
"""

import json
import math
from datetime import datetime
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / "data" / "accidents.json"

with open(DATA_PATH) as f:
    ACCIDENT_DATA = json.load(f)

ROAD_TYPE_RISK = {
    "highway": 0.5,
    "urban":   0.3,
    "rural":   0.6,
    "unknown": 0.4,
}

TIME_RISK_BANDS = [
    (0,   5,  0.9),
    (5,   8,  0.4),
    (8,  10,  0.7),
    (10, 17,  0.3),
    (17, 19,  0.7),
    (19, 22,  0.5),
    (22, 24,  0.9),
]

ACCIDENT_RADIUS_KM = 1.0


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def accident_density_score(lat, lon):
    weighted_count = 0.0
    for acc in ACCIDENT_DATA:
        dist = haversine(lat, lon, acc["lat"], acc["lon"])
        if dist <= ACCIDENT_RADIUS_KM:
            proximity_weight = 1 - (dist / ACCIDENT_RADIUS_KM)
            weighted_count += acc["severity"] * proximity_weight
    return min(weighted_count / 20.0, 1.0)


def time_of_day_score(hour=None):
    if hour is None:
        hour = datetime.now().hour
    for start, end, risk in TIME_RISK_BANDS:
        if start <= hour < end:
            return risk
    return 0.5


def road_type_score(road_type="unknown"):
    return ROAD_TYPE_RISK.get(road_type.lower(), ROAD_TYPE_RISK["unknown"])


def compute_risk_score(lat, lon, road_type="unknown", hour=None):
    density = accident_density_score(lat, lon)
    time    = time_of_day_score(hour)
    road    = road_type_score(road_type)

    composite = (0.50 * density) + (0.30 * time) + (0.20 * road)

    return {
        "accident_density_score": round(density, 3),
        "time_of_day_score":      round(time, 3),
        "road_type_score":        round(road, 3),
        "composite_risk_score":   round(composite, 3),
        "risk_level":             _label(composite),
    }


def _label(score):
    if score < 0.3:
        return "LOW"
    elif score < 0.6:
        return "MEDIUM"
    else:
        return "HIGH"