"""
routing.py
----------
Returns ONE optimal route — the fastest path scored for safety.
In an emergency, clarity beats choice.

POST /api/route/compute
Body: { origin: {lat, lon}, destination: {lat, lon}, road_type: str }
"""

from flask import Blueprint, request, jsonify
from backend.services.osm_service import get_route
from backend.services.risk_scorer import compute_risk_score

routing_bp = Blueprint("routing", __name__)


@routing_bp.route("/compute", methods=["POST"])
def compute():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    try:
        o_lat = float(data["origin"]["lat"])
        o_lon = float(data["origin"]["lon"])
        d_lat = float(data["destination"]["lat"])
        d_lon = float(data["destination"]["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "origin and destination with lat/lon required"}), 400

    road_type = data.get("road_type", "urban")

    # Get fastest route from OSRM
    route = get_route(o_lat, o_lon, d_lat, d_lon)
    offline = False

    if route is None:
        # Offline fallback — straight line estimate
        route   = _fallback(o_lat, o_lon, d_lat, d_lon)
        offline = True

    # Score risk at origin (represents the journey context)
    risk = compute_risk_score(o_lat, o_lon, road_type)

    return jsonify({
        "offline_mode": offline,
        "route": {
            **route,
            "risk":  risk,
            "label": "Optimal Route",
        },
    })


def _fallback(o_lat, o_lon, d_lat, d_lon):
    """Straight-line estimate when OSRM is offline."""
    import math
    R    = 6371000
    dlat = math.radians(d_lat - o_lat)
    dlon = math.radians(d_lon - o_lon)
    a    = (math.sin(dlat / 2) ** 2 +
            math.cos(math.radians(o_lat)) *
            math.cos(math.radians(d_lat)) *
            math.sin(dlon / 2) ** 2)
    dist = R * 2 * math.asin(math.sqrt(a))
    return {
        "duration_seconds": dist / 13.9,
        "distance_meters":  dist,
        "geometry":         [[o_lon, o_lat], [d_lon, d_lat]],
    }