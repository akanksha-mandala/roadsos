"""
routes/emergency.py
-------------------
Endpoints for finding nearest emergency services.

GET /api/emergency/nearby?lat=<float>&lon=<float>&radius=<int>
  → returns hospitals, police stations, ambulance hubs sorted by distance
"""

from flask import Blueprint, request, jsonify
from backend.services.osm_service import find_nearby_services

emergency_bp = Blueprint("emergency", __name__)


@emergency_bp.route("/nearby")
def nearby():
    try:
        lat    = float(request.args["lat"])
        lon    = float(request.args["lon"])
        radius = int(request.args.get("radius", 5000))
    except (KeyError, ValueError):
        return jsonify({"error": "lat and lon are required numeric parameters"}), 400

    radius = max(100, min(radius, 20000))

    services = find_nearby_services(lat, lon, radius_m=radius)

    grouped = {"hospital": [], "police": [], "ambulance": [], "towing": [], "puncture": [], "showroom": []}
    for s in services:
        category = grouped.get(s["type"])
        if category is not None:
            category.append(s)

    return jsonify({
        "origin":   {"lat": lat, "lon": lon},
        "radius_m": radius,
        "total":    len(services),
        "services": grouped,
    })