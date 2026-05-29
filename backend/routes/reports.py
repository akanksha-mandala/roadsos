"""
routes/reports.py
-----------------
Simple in-memory (+ JSON-file-backed) reporting system.
Users can mark accident spots or roadblocks on the map.

POST /api/reports/submit
  Body: { lat, lon, type, description }
  type: "accident" | "roadblock" | "hazard"

GET  /api/reports/list?lat=<f>&lon=<f>&radius=<int>
  Returns reports within radius metres of a point.

GET  /api/reports/all
  Returns all reports (useful for map overlay on page load).
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify

reports_bp = Blueprint("reports", __name__)

REPORTS_FILE = Path(__file__).parent.parent / "data" / "user_reports.json"

VALID_TYPES = {"accident", "roadblock", "hazard"}


def _load_reports():
    if not REPORTS_FILE.exists():
        return []
    with open(REPORTS_FILE) as f:
        return json.load(f)


def _save_reports(reports):
    with open(REPORTS_FILE, "w") as f:
        json.dump(reports, f, indent=2)


def _dist(lat1, lon1, lat2, lon2):
    import math
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


@reports_bp.route("/submit", methods=["POST"])
def submit():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    try:
        lat   = float(data["lat"])
        lon   = float(data["lon"])
        rtype = data["type"].lower()
        desc  = str(data.get("description", "")).strip()[:300]
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "lat, lon, and type are required"}), 400

    if rtype not in VALID_TYPES:
        return jsonify({"error": f"type must be one of {list(VALID_TYPES)}"}), 400

    report = {
        "id":          str(uuid.uuid4())[:8],
        "lat":         lat,
        "lon":         lon,
        "type":        rtype,
        "description": desc or f"User reported {rtype}",
        "timestamp":   datetime.utcnow().isoformat() + "Z",
        "upvotes":     0,
    }

    reports = _load_reports()
    reports.append(report)
    _save_reports(reports)

    return jsonify({"success": True, "report": report}), 201


@reports_bp.route("/list")
def list_reports():
    reports = _load_reports()

    try:
        lat    = float(request.args["lat"])
        lon    = float(request.args["lon"])
        radius = float(request.args.get("radius", 5000))
        reports = [
            r for r in reports
            if _dist(lat, lon, r["lat"], r["lon"]) <= radius
        ]
    except (KeyError, ValueError):
        pass

    reports.sort(key=lambda r: r["timestamp"], reverse=True)
    return jsonify({"count": len(reports), "reports": reports})


@reports_bp.route("/all")
def all_reports():
    reports = _load_reports()
    reports.sort(key=lambda r: r["timestamp"], reverse=True)
    return jsonify({"count": len(reports), "reports": reports})