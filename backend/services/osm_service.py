"""
osm_service.py
--------------
Interfaces with OpenStreetMap Overpass API for real worldwide data.
Falls back to local JSON if API is unreachable.

Key fixes:
 - Timeout increased to 15s (Overpass needs more time)
 - Better query covering hospitals, clinics, healthcare centres
 - Smarter local fallback that scales coords to user location
"""

import json
import math
import requests
from pathlib import Path

DATA_DIR       = Path(__file__).parent.parent / "data"
LOCAL_SERVICES = DATA_DIR / "emergency_services.json"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSRM_URL     = "https://router.project-osrm.org/route/v1/driving"

TIMEOUT = 15   # Overpass needs up to 15s on slow connections


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def find_nearby_services(lat, lon, radius_m=8000):
    """
    Query Overpass for all emergency service types near (lat, lon).
    Includes hospitals, clinics, police, ambulance, towing, puncture, showrooms.
    Falls back to local JSON if Overpass is unavailable.
    """

    # Comprehensive Overpass query — covers more OSM tags for better results
    query = f"""
    [out:json][timeout:{TIMEOUT}];
    (
      node["amenity"="hospital"](around:{radius_m},{lat},{lon});
      way["amenity"="hospital"](around:{radius_m},{lat},{lon});
      relation["amenity"="hospital"](around:{radius_m},{lat},{lon});
      node["amenity"="clinic"](around:{radius_m},{lat},{lon});
      node["healthcare"="hospital"](around:{radius_m},{lat},{lon});
      node["healthcare"="clinic"](around:{radius_m},{lat},{lon});
      node["amenity"="doctors"](around:{radius_m},{lat},{lon});
      node["amenity"="police"](around:{radius_m},{lat},{lon});
      way["amenity"="police"](around:{radius_m},{lat},{lon});
      node["amenity"="fire_station"](around:{radius_m},{lat},{lon});
      node["amenity"="ambulance_station"](around:{radius_m},{lat},{lon});
      node["emergency"="ambulance_station"](around:{radius_m},{lat},{lon});
      node["emergency"="phone"](around:{radius_m},{lat},{lon});
      node["shop"="car_repair"](around:{radius_m},{lat},{lon});
      node["shop"="tyres"](around:{radius_m},{lat},{lon});
      node["shop"="car"](around:{radius_m},{lat},{lon});
      node["amenity"="car_rental"](around:{radius_m},{lat},{lon});
    );
    out center;
    """

    try:
        resp = requests.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=TIMEOUT,
            headers={"User-Agent": "RoadSoS-EmergencyApp/1.0"}
        )
        resp.raise_for_status()
        elements = resp.json().get("elements", [])

        if elements:
            results = _parse_overpass(elements, lat, lon)
            if results:
                return results

        # If Overpass returned empty, use local fallback
        return _load_local_services(lat, lon, radius_m)

    except Exception as e:
        print(f"[OSM] Overpass failed: {e} — using local fallback")
        return _load_local_services(lat, lon, radius_m)


def _parse_overpass(elements, origin_lat, origin_lon):
    """Convert raw Overpass elements into clean dicts."""
    results = []

    for el in elements:
        tags    = el.get("tags", {})
        amenity = tags.get("amenity", "")
        shop    = tags.get("shop", "")
        health  = tags.get("healthcare", "")
        emerg   = tags.get("emergency", "")

        # Map OSM tags to our service types
        if amenity in ("hospital", "clinic", "doctors") or health in ("hospital", "clinic"):
            service_type = "hospital"
        elif amenity == "police":
            service_type = "police"
        elif amenity in ("ambulance_station", "fire_station") or emerg == "ambulance_station":
            service_type = "ambulance"
        elif shop in ("car_repair",):
            service_type = "towing"
        elif shop == "tyres":
            service_type = "puncture"
        elif shop == "car" or amenity == "car_rental":
            service_type = "showroom"
        else:
            continue   # skip unrecognised types

        # Extract coordinates (ways have a "center" key)
        if el["type"] == "way" and "center" in el:
            s_lat = el["center"]["lat"]
            s_lon = el["center"]["lon"]
        elif el["type"] == "relation" and "center" in el:
            s_lat = el["center"]["lat"]
            s_lon = el["center"]["lon"]
        else:
            s_lat = el.get("lat", 0)
            s_lon = el.get("lon", 0)

        if not s_lat or not s_lon:
            continue

        dist = _haversine(origin_lat, origin_lon, s_lat, s_lon)
        name = tags.get("name") or tags.get("name:en") or f"Unnamed {service_type}"

        # Skip unnamed unimportant entries
        if name.startswith("Unnamed") and service_type in ("towing", "showroom"):
            continue

        results.append({
            "id":          str(el["id"]),
            "name":        name,
            "type":        service_type,
            "lat":         s_lat,
            "lon":         s_lon,
            "phone":       tags.get("phone",
                           tags.get("contact:phone",
                           tags.get("contact:mobile", "N/A"))),
            "distance_km": round(dist, 2),
            # Type-specific extras
            "trauma_center":    tags.get("trauma", "no") == "yes",
            "available_beds":   None,
            "flatbed":          False,
            "open_24h":         tags.get("opening_hours", "") == "24/7",
            "brands":           [tags.get("brand", tags.get("operator", ""))],
        })

    return sorted(results, key=lambda x: x["distance_km"])


def _load_local_services(lat, lon, radius_m):
    """
    Load from local JSON. Offsets coordinates so services appear
    near the user's actual location (useful for demo anywhere in world).
    """
    try:
        with open(LOCAL_SERVICES) as f:
            services = json.load(f)
    except Exception:
        return []

    # Calculate offset from Hyderabad center to user's location
    # This makes local demo data appear near wherever the user is
    HYD_LAT, HYD_LON = 17.3850, 78.4867
    lat_offset = lat - HYD_LAT
    lon_offset = lon - HYD_LON

    radius_km = radius_m / 1000
    results   = []

    for s in services:
        # Shift service location to be near user
        shifted_lat = s["lat"] + lat_offset
        shifted_lon = s["lon"] + lon_offset
        dist = _haversine(lat, lon, shifted_lat, shifted_lon)

        if dist <= radius_km:
            entry = {**s,
                     "lat": round(shifted_lat, 5),
                     "lon": round(shifted_lon, 5),
                     "distance_km": round(dist, 2)}
            results.append(entry)

    return sorted(results, key=lambda x: x["distance_km"])


def get_route(origin_lat, origin_lon, dest_lat, dest_lon):
    """Fetch driving route from public OSRM demo server."""
    coords = f"{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
    url    = f"{OSRM_URL}/{coords}"

    try:
        resp = requests.get(
            url,
            params={"overview": "full", "geometries": "geojson"},
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("code") != "Ok":
            return None

        route = data["routes"][0]
        return {
            "duration_seconds": route["duration"],
            "distance_meters":  route["distance"],
            "geometry":         route["geometry"]["coordinates"],
        }

    except Exception:
        return None