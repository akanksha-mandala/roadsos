// ─────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────
const State = {
  lat:          null,
  lon:          null,
  destLat:      null,
  destLon:      null,
  destName:     null,
  activeFilter: "all",
  activeReport: "accident",
  allServices:  [],
  reportCount:  0,
  watchId:      null,
  liveMarker:   null,
  tracking:     false,
};

const SERVICE_EMOJI = {
  hospital:  "🏥",
  police:    "👮",
  ambulance: "🚑",
  towing:    "🚛",
  puncture:  "🔧",
  showroom:  "🏪",
};

const ROUTE_COLORS = {
  fastest: "#f59e0b",
  safest:  "#10b981",
};

// ─────────────────────────────────────────────────
// HOME PAGE → APP TRANSITION
// ─────────────────────────────────────────────────
document.getElementById("btn-enter").addEventListener("click", () => {
  const home = document.getElementById("home-page");
  const app  = document.getElementById("app-page");
  home.classList.add("fade-out");
  setTimeout(() => {
    home.classList.add("hidden");
    app.classList.remove("hidden");
    MapManager.fixSize();
    checkOnlineStatus();
    loadExistingReports();
    tryAutoLocate();
  }, 600);
});

// ─────────────────────────────────────────────────
// AUTO LOCATE
// ─────────────────────────────────────────────────
function tryAutoLocate() {
  if (!navigator.geolocation) { setSignal(false); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude, true),
    ()    => setSignal(false),
    { timeout: 10000, maximumAge: 60000 }
  );
}

function applyLocation(lat, lon, fromGPS = false) {
  State.lat = lat;
  State.lon = lon;
  document.getElementById("inp-lat").value = lat.toFixed(5);
  document.getElementById("inp-lon").value = lon.toFixed(5);
  MapManager.setOriginMarker(lat, lon);
  setSignal(true);
  const badge = document.getElementById("loc-badge");
  badge.textContent = fromGPS ? "GPS LOCK" : "MANUAL";
  badge.classList.add("active");
}

document.getElementById("btn-locate").addEventListener("click", () => {
  if (!navigator.geolocation) { alert("Geolocation not supported."); return; }
  setSignal(false);
  document.getElementById("loc-badge").textContent = "SEARCHING...";
  navigator.geolocation.getCurrentPosition(
    (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude, true),
    () => {
      setSignal(false);
      document.getElementById("loc-badge").textContent = "FAILED";
      alert("Location denied. Enter coordinates manually.");
    },
    { timeout: 10000 }
  );
});

document.getElementById("btn-use-manual").addEventListener("click", () => {
  const lat = parseFloat(document.getElementById("inp-lat").value);
  const lon = parseFloat(document.getElementById("inp-lon").value);
  if (isNaN(lat) || isNaN(lon)) { alert("Enter valid lat/lon."); return; }
  applyLocation(lat, lon, false);
});

// ─────────────────────────────────────────────────
// ROAD TYPE AUTO-DETECTION FROM DISTANCE
// <5km = urban, 5-30km = highway, >30km = rural
// ─────────────────────────────────────────────────
function autoDetectRoadType(oLat, oLon, dLat, dLon) {
  const R    = 6371;
  const dLt  = (dLat - oLat) * Math.PI / 180;
  const dLn  = (dLon - oLon) * Math.PI / 180;
  const a    = Math.sin(dLt/2)**2 +
    Math.cos(oLat * Math.PI/180) *
    Math.cos(dLat * Math.PI/180) *
    Math.sin(dLn/2)**2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  let type, info;
  if (km < 5) {
    type = "urban";
    info = `🏙 Auto-detected: Urban road (${km.toFixed(1)} km — city range)`;
  } else if (km < 30) {
    type = "highway";
    info = `🛣 Auto-detected: Highway (${km.toFixed(1)} km — inter-city range)`;
  } else {
    type = "rural";
    info = `🌾 Auto-detected: Rural (${km.toFixed(1)} km — long distance)`;
  }
  document.getElementById("road-type").value = type;
  document.getElementById("road-type-info").textContent = info;
  return type;
}

// ─────────────────────────────────────────────────
// SET DESTINATION + AUTO-COMPUTE ROUTES
// ─────────────────────────────────────────────────
function setDestination(service) {
  State.destLat  = service.lat;
  State.destLon  = service.lon;
  State.destName = service.name;

  document.getElementById("dest-lat").value = service.lat.toFixed(5);
  document.getElementById("dest-lon").value = service.lon.toFixed(5);

  const nameEl = document.getElementById("dest-selected-name");
  nameEl.textContent = `🎯 ${service.name}`;
  nameEl.classList.remove("hidden");

  const badge = document.getElementById("dest-badge");
  badge.textContent = "SET ✓";
  badge.classList.add("active");

  // Auto-detect road type
  if (State.lat) {
    autoDetectRoadType(State.lat, State.lon, service.lat, service.lon);
  }

  // Highlight selected item in list
  document.querySelectorAll(".svc-item")
    .forEach(el => el.classList.remove("svc-selected"));
  const item = document.querySelector(`[data-svc-id="${service.id}"]`);
  if (item) {
    item.classList.add("svc-selected");
    item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Place destination marker
  MapManager.setDestMarker(service.lat, service.lon, service.name);

  // Fit map bounds to show both points
  if (State.lat) {
    const bounds = L.latLngBounds(
      [State.lat, State.lon],
      [service.lat, service.lon]
    );
    MapManager.map.fitBounds(bounds, { padding: [80, 80] });
  }

  showToast(`🎯 Destination set — computing routes...`);

  // ── AUTO-COMPUTE ROUTES immediately ──
  // Short delay so map animation completes first
  if (State.lat && State.lon) {
    setTimeout(() => computeRoutes(), 800);
  } else {
    // No origin yet — scroll to and pulse the button
    const btn = document.getElementById("btn-route");
    btn.scrollIntoView({ behavior: "smooth", block: "center" });
    btn.style.animation = "none";
    setTimeout(() => {
      btn.style.boxShadow = "0 0 0 0 rgba(20,184,166,0.7)";
      btn.style.animation = "btnFlash 0.6s ease 3";
    }, 100);
  }
}

// Manual coord destination
["dest-lat", "dest-lon"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    const lat = parseFloat(document.getElementById("dest-lat").value);
    const lon = parseFloat(document.getElementById("dest-lon").value);
    if (!isNaN(lat) && !isNaN(lon)) {
      State.destLat  = lat;
      State.destLon  = lon;
      State.destName = "Custom Location";
      document.getElementById("dest-selected-name").classList.add("hidden");
      document.getElementById("dest-badge").textContent = "MANUAL";
      document.getElementById("dest-badge").classList.add("active");
      if (State.lat) autoDetectRoadType(State.lat, State.lon, lat, lon);
      MapManager.setDestMarker(lat, lon, "Custom Location");
    }
  });
});

window.addEventListener("setDestFromMap", (e) => setDestination(e.detail));

// ─────────────────────────────────────────────────
// SOS
// ─────────────────────────────────────────────────
document.getElementById("sos-trigger").addEventListener("click", () => {
  document.getElementById("sos-overlay").classList.remove("hidden");
  document.getElementById("sos-status").textContent = "Locating your position...";
  document.getElementById("sos-contacts").innerHTML = "";

  const doSOS = (lat, lon) => {
    document.getElementById("sos-status").textContent =
      "Fetching nearest emergency contacts...";

    fetch(`/api/emergency/nearby?lat=${lat}&lon=${lon}&radius=10000`)
      .then(r => r.json())
      .then(data => {
        const contacts = [
          ...(data.services.hospital  || []).slice(0, 1),
          ...(data.services.police    || []).slice(0, 1),
          ...(data.services.ambulance || []).slice(0, 1),
        ];
        document.getElementById("sos-status").textContent =
          `${contacts.length} emergency contacts found`;

        const container = document.getElementById("sos-contacts");
        container.innerHTML = "";
        contacts.forEach(c => {
          const div = document.createElement("div");
          div.className = "sos-contact-item";
          div.innerHTML = `
            <span>${SERVICE_EMOJI[c.type]||"📞"} <b>${c.name}</b>
              <small style="color:var(--muted)"> · ${c.distance_km} km</small>
            </span>
            <a href="tel:${c.phone}">${c.phone}</a>`;
          container.appendChild(div);
        });
        [["🆘 National","112"],["🚑 Ambulance","108"],
         ["👮 Police","100"],["🚒 Fire","101"]].forEach(([l,n]) => {
          const div = document.createElement("div");
          div.className = "sos-contact-item";
          div.innerHTML = `<span>${l}</span><a href="tel:${n}">${n}</a>`;
          container.appendChild(div);
        });
      })
      .catch(() => {
        document.getElementById("sos-status").textContent =
          "Offline — national numbers:";
        document.getElementById("sos-contacts").innerHTML = `
          <div class="sos-contact-item"><span>🆘 National</span><a href="tel:112">112</a></div>
          <div class="sos-contact-item"><span>🚑 Ambulance</span><a href="tel:108">108</a></div>
          <div class="sos-contact-item"><span>👮 Police</span><a href="tel:100">100</a></div>
          <div class="sos-contact-item"><span>🚒 Fire</span><a href="tel:101">101</a></div>`;
      });
  };

  if (State.lat) {
    doSOS(State.lat, State.lon);
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyLocation(pos.coords.latitude, pos.coords.longitude, true);
        doSOS(pos.coords.latitude, pos.coords.longitude);
      },
      () => doSOS(17.3850, 78.4867)
    );
  } else {
    doSOS(17.3850, 78.4867);
  }
});

document.getElementById("sos-cancel").addEventListener("click", () => {
  document.getElementById("sos-overlay").classList.add("hidden");
});

// ─────────────────────────────────────────────────
// FILTER CHIPS — updates both list AND map markers
// ─────────────────────────────────────────────────
document.getElementById("filter-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("chip-active"));
  chip.classList.add("chip-active");
  State.activeFilter = chip.dataset.type;

  renderServiceList();

  // Redraw only matching markers on map
  MapManager.clearLayer("services");
  const toShow = State.activeFilter === "all"
    ? State.allServices
    : State.allServices.filter(s => s.type === State.activeFilter);
  toShow.forEach(s => MapManager.addServiceMarker(s));
  // Update offline kit with latest hospital data
  updateOfflineKit();
});

// ─────────────────────────────────────────────────
// FIND SERVICES — real OSM data, fallback to local
// ─────────────────────────────────────────────────
document.getElementById("btn-services").addEventListener("click", async () => {
  if (!requireLocation()) return;

  const listEl = document.getElementById("services-list");
  listEl.innerHTML = `
    <div style="font-family:var(--font-m);font-size:0.72rem;
      color:var(--muted);padding:12px 0;text-align:center">
      🔍 Querying OpenStreetMap live data...
    </div>`;
  MapManager.clearLayer("services");

  try {
    const res  = await fetch(
      `/api/emergency/nearby?lat=${State.lat}&lon=${State.lon}&radius=8000`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");

    State.allServices = Object.values(data.services).flat();
    document.getElementById("cnt-total").textContent = State.allServices.length;

    const toShow = State.activeFilter === "all"
      ? State.allServices
      : State.allServices.filter(s => s.type === State.activeFilter);
    toShow.forEach(s => MapManager.addServiceMarker(s));

    renderServiceList();

    const badge = document.getElementById("svc-badge");
    badge.textContent = navigator.onLine ? "LIVE OSM" : "CACHED";
    badge.classList.add("active");

  } catch (err) {
    listEl.innerHTML = `
      <div style="color:var(--danger);font-family:var(--font-m);
        font-size:0.72rem;padding:10px 0;text-align:center">
        ⚠ ${err.message} — trying fallback...
      </div>`;
    try {
      const r2   = await fetch(
        `/api/emergency/nearby?lat=${State.lat}&lon=${State.lon}&radius=15000`
      );
      const d2   = await r2.json();
      State.allServices = Object.values(d2.services).flat();
      document.getElementById("cnt-total").textContent = State.allServices.length;
      const toShow = State.activeFilter === "all"
        ? State.allServices
        : State.allServices.filter(s => s.type === State.activeFilter);
      toShow.forEach(s => MapManager.addServiceMarker(s));
      renderServiceList();
    } catch { /* silent */ }
  }
});

function renderServiceList() {
  const listEl = document.getElementById("services-list");
  listEl.innerHTML = "";

  const filtered = State.activeFilter === "all"
    ? State.allServices
    : State.allServices.filter(s => s.type === State.activeFilter);

  if (!filtered.length) {
    listEl.innerHTML = `
      <div style="font-family:var(--font-m);font-size:0.72rem;
        color:var(--muted);padding:8px 0;text-align:center">
        No ${State.activeFilter === "all" ? "" : State.activeFilter} services found
      </div>`;
    return;
  }

  filtered.forEach(s => {
    const div = document.createElement("div");
    div.className = "svc-item";
    div.dataset.svcId = s.id;
    if (State.destName === s.name) div.classList.add("svc-selected");

    div.innerHTML = `
      <span class="svc-emoji">${SERVICE_EMOJI[s.type] || "📍"}</span>
      <div class="svc-info">
        <div class="svc-name">${s.name}</div>
        <div class="svc-meta">${s.type.toUpperCase()} · 📞 ${s.phone}</div>
        <div class="svc-set-dest">⚡ DOUBLE-TAP → AUTO ROUTE</div>
      </div>
      <div class="svc-dist">${s.distance_km}<br>km</div>
    `;

    // Single tap → fly to on map
    div.addEventListener("click", () => {
      MapManager.map.setView([s.lat, s.lon], 16);
      div.classList.add("svc-dbl-hint");
      setTimeout(() => div.classList.remove("svc-dbl-hint"), 600);
    });

    // Double click → set destination + auto-route
    div.addEventListener("dblclick", (e) => {
      e.preventDefault();
      setDestination(s);
    });

    // Mobile double-tap support
    let lastTap = 0;
    div.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTap < 350) {
        e.preventDefault();
        setDestination(s);
      }
      lastTap = now;
    });

    listEl.appendChild(div);
  });
}

// ─────────────────────────────────────────────────
// CORE ROUTE COMPUTATION FUNCTION
// Called automatically after destination set
// Also called by manual button click
// ─────────────────────────────────────────────────
async function computeRoutes() {
  if (!requireLocation()) return;

  const destLat  = State.destLat  ?? parseFloat(document.getElementById("dest-lat").value);
  const destLon  = State.destLon  ?? parseFloat(document.getElementById("dest-lon").value);
  const roadType = document.getElementById("road-type").value;

  if (isNaN(destLat) || isNaN(destLon)) {
    alert(
      "No destination set.\n\n" +
      "Search nearby services, then DOUBLE-TAP a result\n" +
      "to set destination and auto-compute the route."
    );
    return;
  }

  // Clear any previous route
  MapManager.clearLayer("fastest");
  MapManager.clearLayer("safest");
  stopLiveTracking();

  const routePanel = document.getElementById("route-panel");
  const wrap       = document.getElementById("route-cards-wrap");
  routePanel.classList.remove("hidden");
  wrap.innerHTML = `
    <div style="font-family:var(--font-m);font-size:0.72rem;
      color:var(--muted);padding:12px 0;text-align:center">
      🔄 Finding best route...
    </div>`;

  try {
    const res = await fetch("/api/route/compute", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin:      { lat: State.lat, lon: State.lon },
        destination: { lat: destLat,  lon: destLon   },
        road_type:   roadType,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Routing failed");

    if (data.offline_mode) showOfflineBanner();

    // Draw single optimal route in green
    MapManager.drawRoute(data.route.geometry, "safest", "#10b981");

    // Store for live tracking
    State.routeCoords = data.route.geometry;

    // Destination marker
    MapManager.setDestMarker(destLat, destLon, State.destName || "Destination");

    // Hide route legend (no longer needed for single route)
    document.getElementById("route-legend").classList.add("hidden");

    // Render single route card
    wrap.innerHTML = "";
    wrap.appendChild(buildRouteCard(data.route));

    // Hide comparison table — not relevant for single route
    document.getElementById("compare-table").classList.add("hidden");

    // Show risk gauge
    showRiskGauge(data.route.risk);

    // Start live tracking dot
    startLiveTracking();

    showToast("✅ Best route found — tracking active");

  } catch (err) {
    wrap.innerHTML = `
      <div style="color:var(--danger);font-family:var(--font-m);
        font-size:0.72rem;padding:10px;text-align:center">
        ⚠ ${err.message}
      </div>`;
    showToast("⚠ Routing failed — check connection");
  }
}

// Manual compute button
document.getElementById("btn-route").addEventListener("click", computeRoutes);

function buildRouteCard(route) {
  const mins       = Math.round(route.duration_seconds / 60);
  const km         = (route.distance_meters / 1000).toFixed(1);
  const risk       = route.risk;
  const riskColors = { LOW:"#10b981", MEDIUM:"#f59e0b", HIGH:"#ef4444" };
  const color      = riskColors[risk.risk_level] || "#10b981";

  const div      = document.createElement("div");
  div.className  = "route-card safest";
  div.innerHTML  = `
    <div class="route-card-title">🚀 BEST ROUTE</div>
    <div class="route-stat-row">
      <span class="route-stat-label">DURATION</span>
      <span class="route-stat-val">${mins} min</span>
    </div>
    <div class="route-stat-row">
      <span class="route-stat-label">DISTANCE</span>
      <span class="route-stat-val">${km} km</span>
    </div>
    <div class="route-stat-row">
      <span class="route-stat-label">RISK SCORE</span>
      <span class="route-stat-val">${risk.composite_risk_score}</span>
    </div>
    <div class="route-stat-row">
      <span class="route-stat-label">ACCIDENTS NEAR</span>
      <span class="route-stat-val">${risk.accident_density_score}</span>
    </div>
    <div class="route-stat-row">
      <span class="route-stat-label">TIME OF DAY</span>
      <span class="route-stat-val">${risk.time_of_day_score}</span>
    </div>
    <span class="risk-pill risk-${risk.risk_level}"
      style="background:${color}22;color:${color}">
      ${risk.risk_level} RISK — PROCEED ${risk.risk_level === "HIGH" ? "WITH CAUTION" : "SAFELY"}
    </span>
    <div style="
      margin-top:10px;
      font-family:var(--font-m);
      font-size:0.62rem;
      color:var(--muted);
      line-height:1.6;
      border-top:1px solid var(--border);
      padding-top:8px;">
      ℹ This is the fastest available route.<br>
      Risk score accounts for accident history,<br>
      time of day, and road conditions.
    </div>
  `;
  return div;
}
// ─────────────────────────────────────────────────
// OFFLINE EMERGENCY KIT — cache nearest hospital
// ─────────────────────────────────────────────────
function updateOfflineKit() {
  if (!State.allServices.length) return;

  // Find nearest hospital from cached services
  const hospitals = State.allServices
    .filter(s => s.type === "hospital")
    .sort((a, b) => a.distance_km - b.distance_km);

  if (!hospitals.length) return;

  const h = hospitals[0];

  // Save to localStorage for true offline access
  try {
    localStorage.setItem("roadsos_cached_hospital", JSON.stringify({
      name:        h.name,
      phone:       h.phone,
      distance_km: h.distance_km,
      lat:         h.lat,
      lon:         h.lon,
      cachedAt:    new Date().toISOString(),
    }));
  } catch (e) { /* storage not available */ }

  showCachedHospital(h);
}

function showCachedHospital(h) {
  const card = document.getElementById("kit-cached-hospital");
  if (!card) return;
  card.classList.remove("hidden");
  document.getElementById("kit-hospital-name").textContent = h.name;
  document.getElementById("kit-hospital-dist").textContent =
    `${h.distance_km} km away · Last updated: just now`;
  const phoneEl = document.getElementById("kit-hospital-phone");
  phoneEl.textContent = `📞 ${h.phone} — TAP TO CALL`;
  phoneEl.href = `tel:${h.phone}`;
}

// Load cached hospital even when offline
function loadCachedHospitalFromStorage() {
  try {
    const raw = localStorage.getItem("roadsos_cached_hospital");
    if (!raw) return;
    const h = JSON.parse(raw);
    const cachedAt = new Date(h.cachedAt);
    const hoursAgo = Math.round((new Date() - cachedAt) / 3600000);
    showCachedHospital({
      ...h,
      distance_km: `${h.distance_km} (cached ${hoursAgo}h ago)`,
    });
  } catch (e) { /* ignore */ }
}

function fillCompareTable(fastest, safest) {
  // Deprecated — single route mode
  document.getElementById("compare-table").classList.add("hidden");
}
function showRiskGauge(risk) {
  document.getElementById("risk-overlay").classList.remove("hidden");
  const score      = risk.composite_risk_score;
  const riskColors = { LOW:"#10b981", MEDIUM:"#f59e0b", HIGH:"#ef4444" };
  const color      = riskColors[risk.risk_level];
  const arc        = document.getElementById("risk-arc");
  arc.style.stroke          = color;
  arc.style.strokeDashoffset = 173;
  setTimeout(() => {
    arc.style.transition       = "stroke-dashoffset 1s ease";
    arc.style.strokeDashoffset = 173 - (score * 173);
  }, 60);
  document.getElementById("risk-num-svg").textContent = score;
  document.getElementById("risk-num-svg").style.fill  = color;
  const badge = document.getElementById("risk-level-badge");
  badge.textContent = risk.risk_level;
  badge.className   = `risk-level-badge risk-${risk.risk_level}`;
  document.getElementById("risk-factors-mini").innerHTML = `
    Accidents&nbsp;&nbsp;&nbsp;${risk.accident_density_score}<br>
    Time of day&nbsp;${risk.time_of_day_score}<br>
    Road type&nbsp;&nbsp;&nbsp;${risk.road_type_score}`;
}

// ─────────────────────────────────────────────────
// LIVE TRACKING — Uber/Rapido style moving dot
// ─────────────────────────────────────────────────
function startLiveTracking() {
  if (!navigator.geolocation) return;
  stopLiveTracking();
  State.tracking   = true;
  State.liveMarker = MapManager.createLiveDot(State.lat, State.lon);

  State.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      if (State.liveMarker) State.liveMarker.setLatLng([lat, lon]);
      State.lat = lat;
      State.lon = lon;
      // Auto-pan if dot nears map edge
      if (!MapManager.map.getBounds().contains(L.latLng(lat, lon))) {
        MapManager.map.panTo([lat, lon], { animate: true, duration: 0.8 });
      }
    },
    (err) => console.warn("GPS watch error:", err.message),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
  );
}

function stopLiveTracking() {
  if (State.watchId !== null) {
    navigator.geolocation.clearWatch(State.watchId);
    State.watchId = null;
  }
  State.tracking = false;
  if (State.liveMarker) {
    MapManager.map.removeLayer(State.liveMarker);
    State.liveMarker = null;
  }
}

// ─────────────────────────────────────────────────
// INCIDENT REPORTING
// ─────────────────────────────────────────────────
document.querySelectorAll(".report-type-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".report-type-btn")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    State.activeReport = btn.dataset.rtype;
  });
});

document.getElementById("btn-report").addEventListener("click", async () => {
  if (!requireLocation()) return;

  const desc = document.getElementById("report-desc").value.trim();
  const fb   = document.getElementById("report-feedback");
  fb.textContent = "Submitting...";
  fb.className   = "feedback-msg";

  // Find nearest relevant service to include in report
  let nearestInfo = "";
  if (State.allServices.length > 0) {
    const relevant = State.allServices
      .filter(s => State.activeReport === "accident"
        ? (s.type === "hospital" || s.type === "ambulance")
        : s.type === "police")
      .sort((a, b) => a.distance_km - b.distance_km);
    if (relevant.length > 0) {
      const n = relevant[0];
      nearestInfo =
        `Nearest ${n.type}: ${n.name} (${n.distance_km} km, 📞 ${n.phone})`;
    }
  }

  const fullDesc = desc
    ? `${desc}${nearestInfo ? " | " + nearestInfo : ""}`
    : nearestInfo || `User reported ${State.activeReport}`;

  try {
    const res = await fetch("/api/reports/submit", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat:         State.lat,
        lon:         State.lon,
        type:        State.activeReport,
        description: fullDesc,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const labels = {
      accident:  "Accident reported. Nearest help shown.",
      roadblock: "Roadblock reported. Police notified.",
      hazard:    "Hazard reported. Area flagged.",
    };
    fb.textContent = `✓ ${labels[State.activeReport]}`;
    fb.className   = "feedback-msg feedback-ok";
    document.getElementById("report-desc").value = "";

    MapManager.addReportMarker(data.report);
    State.reportCount++;
    document.getElementById("cnt-reports").textContent = State.reportCount;

  } catch (err) {
    fb.textContent = `✗ ${err.message}`;
    fb.className   = "feedback-msg feedback-err";
  }
});

// ─────────────────────────────────────────────────
// REPORTS PAGE
// ─────────────────────────────────────────────────
document.getElementById("btn-open-reports").addEventListener("click", async () => {
  document.getElementById("reports-overlay").classList.remove("hidden");
  const content = document.getElementById("reports-content");
  content.innerHTML = `<div class="reports-loading">Loading reports...</div>`;

  try {
    const res  = await fetch("/api/reports/all");
    const data = await res.json();

    if (!data.reports || data.reports.length === 0) {
      content.innerHTML = `
        <div class="reports-empty">
          📭 No incidents reported yet.<br>
          <span style="font-size:0.72rem;color:var(--muted2)">
            Submitted reports will appear here.
          </span>
        </div>`;
      return;
    }

    content.innerHTML = "";
    const sorted = [...data.reports]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    sorted.forEach(r => {
      const card     = document.createElement("div");
      card.className = `report-card ${r.type}`;

      const typeEmoji  = { accident:"💥", roadblock:"🚧", hazard:"⚠️" };
      const badgeClass = `badge-${r.type}`;

      let mainDesc    = r.description;
      let nearestLine = "";
      if (r.description.includes(" | Nearest")) {
        const parts = r.description.split(" | ");
        mainDesc    = parts[0];
        nearestLine = parts[1] || "";
      }

      card.innerHTML = `
        <div class="report-card-top">
          <div class="report-card-type">
            ${typeEmoji[r.type] || "⚠️"}
            <span class="report-type-badge ${badgeClass}">
              ${r.type.toUpperCase()}
            </span>
          </div>
          <div class="report-card-time">${getTimeAgo(new Date(r.timestamp))}</div>
        </div>
        <div class="report-card-desc">${mainDesc}</div>
        <div class="report-card-coords">
          📍 ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}
        </div>
        ${nearestLine ? `
          <div class="report-card-nearest">🏥 ${nearestLine}</div>
        ` : ""}`;

      card.style.cursor = "pointer";
      card.title        = "Click to view on map";
      card.addEventListener("click", () => {
        document.getElementById("reports-overlay").classList.add("hidden");
        MapManager.map.setView([r.lat, r.lon], 17);
        showToast(`📍 Showing: ${r.type} report`);
      });

      content.appendChild(card);
    });

  } catch {
    content.innerHTML = `
      <div class="reports-empty">
        ⚠ Could not load reports. Check server.
      </div>`;
  }
});

document.getElementById("reports-close").addEventListener("click", () => {
  document.getElementById("reports-overlay").classList.add("hidden");
});

function getTimeAgo(date) {
  const secs = Math.floor((new Date() - date) / 1000);
  if (secs < 60)    return "just now";
  if (secs < 3600)  return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return date.toLocaleDateString();
}

// ─────────────────────────────────────────────────
// LOAD EXISTING REPORTS ON STARTUP
// ─────────────────────────────────────────────────
async function loadExistingReports() {
  loadCachedHospitalFromStorage();
  try {
    const res  = await fetch("/api/reports/all");
    const data = await res.json();
    data.reports.forEach(r => MapManager.addReportMarker(r));
    State.reportCount = data.count;
    document.getElementById("cnt-reports").textContent = data.count;
  } catch { /* non-fatal */ }
}

// ─────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────
function requireLocation() {
  if (State.lat !== null) return true;
  alert("Set your location first — click AUTO-DETECT.");
  return false;
}

function setSignal(online) {
  const bars = document.getElementById("signal-bars");
  bars.className = "signal-bars " + (online ? "online" : "offline");
  const el   = document.getElementById("cnt-online");
  el.textContent = online ? "LIVE" : "OFFL";
  el.style.color = online ? "var(--accent)" : "var(--warn)";
}

function checkOnlineStatus() {
  setSignal(navigator.onLine);

  // Show offline kit only when actually offline
  if (!navigator.onLine) {
    showOfflineKit();
  } else {
    hideOfflineKit();
  }

  window.addEventListener("online", () => {
    setSignal(true);
    hideOfflineBanner();
    hideOfflineKit();   // back online — hide the kit, free up sidebar space
  });

  window.addEventListener("offline", () => {
    setSignal(false);
    showOfflineBanner();
    showOfflineKit();   // just went offline — show emergency kit immediately
    loadCachedHospitalFromStorage(); // reload cached hospital
  });
}

function showOfflineKit() {
  document.getElementById("offline-kit-card").classList.remove("hidden");
}

function hideOfflineKit() {
  document.getElementById("offline-kit-card").classList.add("hidden");
}

function showOfflineBanner()  {
  document.getElementById("offline-banner").classList.remove("hidden");
}
function hideOfflineBanner()  {
  document.getElementById("offline-banner").classList.add("hidden");
}

function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = `
      position:fixed;bottom:28px;left:50%;
      transform:translateX(-50%);
      background:var(--accent);color:#fff;
      font-family:'Rajdhani',sans-serif;font-weight:700;
      font-size:0.85rem;letter-spacing:0.1em;
      padding:10px 24px;border-radius:8px;z-index:6000;
      transition:opacity 0.4s;pointer-events:none;
      box-shadow:0 4px 20px rgba(16,185,129,0.4);`;
    document.body.appendChild(t);
  }
  t.textContent   = msg;
  t.style.opacity = "1";
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = "0"; }, 3000);
}