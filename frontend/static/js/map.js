const MapManager = (() => {
  const FALLBACK_LAT = 17.3850;
  const FALLBACK_LON = 78.4867;

  // Create map but don't auto-center yet — wait for GPS
  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: false,
  }).setView([FALLBACK_LAT, FALLBACK_LON], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // One layer group per type — clears cleanly
  const layers = {
    origin:      L.layerGroup().addTo(map),
    destination: L.layerGroup().addTo(map),
    services:    L.layerGroup().addTo(map),
    reports:     L.layerGroup().addTo(map),
    fastest:     L.layerGroup().addTo(map),
    safest:      L.layerGroup().addTo(map),
  };

  // Blue/teal theme — color + emoji + size per type
  const TYPE_META = {
    hospital:  { emoji: "🏥", color: "#10b981", size: 46 }, // emerald
    police:    { emoji: "👮", color: "#0ea5e9", size: 46 }, // sky blue
    ambulance: { emoji: "🚑", color: "#14b8a6", size: 46 }, // teal
    towing:    { emoji: "🚛", color: "#f59e0b", size: 42 }, // amber
    puncture:  { emoji: "🔧", color: "#f59e0b", size: 40 }, // amber
    showroom:  { emoji: "🏪", color: "#a78bfa", size: 40 }, // purple
    accident:  { emoji: "💥", color: "#ef4444", size: 42 }, // red
    roadblock: { emoji: "🚧", color: "#f59e0b", size: 42 }, // amber
    hazard:    { emoji: "⚠️", color: "#fbbf24", size: 40 }, // yellow
  };

  // ── Standard service/report icon ──
  function makeIcon(type) {
    const meta = TYPE_META[type] || { emoji: "📍", color: "#0ea5e9", size: 40 };
    const { emoji, color, size } = meta;
    const fs = Math.round(size * 0.44);

    return L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:${size}px;height:${size}px;">
          <div style="
            position:absolute;inset:-5px;border-radius:50%;
            border:1.5px solid ${color};opacity:0.35;
            animation:mkPulse 2.2s ease-in-out infinite;
          "></div>
          <div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:radial-gradient(circle at 32% 32%,${color}44,${color}18);
            border:2.5px solid ${color};
            display:flex;align-items:center;justify-content:center;
            font-size:${fs}px;
            box-shadow:0 0 14px ${color}66,0 3px 14px rgba(0,0,0,0.65);
          ">${emoji}</div>
        </div>
        <style>
          @keyframes mkPulse{
            0%,100%{transform:scale(1);opacity:0.35}
            50%{transform:scale(1.35);opacity:0.08}
          }
        </style>`,
      iconSize:    [size, size],
      iconAnchor:  [size / 2, size / 2],
      popupAnchor: [0, -(size / 2 + 4)],
    });
  }

  // ── Pulsing blue origin marker ──
  function makeOriginIcon() {
    const c = "#0ea5e9";
    return L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:54px;height:54px;">
          <div style="
            position:absolute;inset:-7px;border-radius:50%;
            border:1.5px solid ${c};
            animation:ogPulse 1.6s ease-out infinite;
          "></div>
          <div style="
            position:absolute;inset:-14px;border-radius:50%;
            border:1px solid ${c};opacity:0.4;
            animation:ogPulse 1.6s ease-out infinite;
            animation-delay:0.5s;
          "></div>
          <div style="
            width:54px;height:54px;border-radius:50%;
            background:radial-gradient(circle at 32% 32%,${c}55,${c}20);
            border:3px solid ${c};
            display:flex;align-items:center;justify-content:center;
            font-size:24px;
            box-shadow:0 0 22px ${c}99,0 4px 16px rgba(0,0,0,0.7);
          ">📍</div>
        </div>
        <style>
          @keyframes ogPulse{
            0%{transform:scale(0.75);opacity:0.9}
            100%{transform:scale(1.9);opacity:0}
          }
        </style>`,
      iconSize:    [54, 54],
      iconAnchor:  [27, 27],
      popupAnchor: [0, -30],
    });
  }

  // ── Pulsing green destination marker ──
  function makeDestIcon(name) {
    const c = "#10b981";
    return L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:58px;height:58px;">
          <div style="
            position:absolute;inset:-6px;border-radius:50%;
            border:2px solid ${c};
            animation:dstPulse 1.3s ease-out infinite;
          "></div>
          <div style="
            position:absolute;inset:-13px;border-radius:50%;
            border:1.5px solid ${c};opacity:0.3;
            animation:dstPulse 1.3s ease-out infinite;
            animation-delay:0.45s;
          "></div>
          <div style="
            width:58px;height:58px;border-radius:50%;
            background:radial-gradient(circle at 32% 32%,${c}55,${c}20);
            border:3px solid ${c};
            display:flex;align-items:center;justify-content:center;
            font-size:26px;
            box-shadow:0 0 24px ${c}99,0 4px 18px rgba(0,0,0,0.7);
          ">🎯</div>
        </div>
        <style>
          @keyframes dstPulse{
            0%{transform:scale(0.8);opacity:0.85}
            100%{transform:scale(1.7);opacity:0}
          }
        </style>`,
      iconSize:    [58, 58],
      iconAnchor:  [29, 29],
      popupAnchor: [0, -32],
    });
  }

  // ── PUBLIC API ──
  return {
    map,
    layers,

    // Called after the app page becomes visible — fixes black map bug
    fixSize() {
      setTimeout(() => map.invalidateSize(), 100);
    },

    clearLayer(name) {
      layers[name]?.clearLayers();
    },

    // Blue pulsing origin
    setOriginMarker(lat, lon) {
      this.clearLayer("origin");
      L.marker([lat, lon], {
        icon: makeOriginIcon(),
        zIndexOffset: 2000,
      })
        .bindPopup(`
          <b>📍 Your Location</b>
          <span style="display:block;font-size:0.7rem;
            color:#3d5a73;margin-top:3px">
            ${lat.toFixed(5)}, ${lon.toFixed(5)}
          </span>`)
        .addTo(layers.origin);
      map.setView([lat, lon], 14);
    },

    // Green pulsing destination — shown at route endpoint
    setDestMarker(lat, lon, name) {
      this.clearLayer("destination");
      L.marker([lat, lon], {
        icon: makeDestIcon(name),
        zIndexOffset: 1900,
      })
        .bindPopup(`
          <b>🎯 ${name || "Destination"}</b>
          <span style="display:block;font-size:0.7rem;
            color:#3d5a73;margin-top:3px">
            Route endpoint
          </span>`)
        .addTo(layers.destination);
    },

    // Service markers with rich popups
    addServiceMarker(service) {
      let extra = "";
      if (service.type === "hospital") {
        if (service.trauma_center)
          extra += `<span style="color:#ef4444;font-size:0.76rem">
            🚨 Trauma Centre</span><br>`;
        if (service.available_beds)
          extra += `<span style="font-size:0.76rem">
            🛏 Beds: ${service.available_beds}</span><br>`;
      } else if (service.type === "towing") {
        extra = `<span style="font-size:0.76rem">
          ${service.flatbed
            ? "✅ Flatbed available"
            : "🔗 Standard tow"}</span><br>`;
      } else if (service.type === "puncture") {
        extra = service.open_24h
          ? `<span style="color:#10b981;font-size:0.76rem">
              🕐 Open 24 hrs</span><br>`
          : `<span style="font-size:0.76rem">🕐 Check hours</span><br>`;
      } else if (service.type === "showroom") {
        extra = `<span style="font-size:0.76rem">
          🚗 ${(service.brands || []).join(", ")}</span><br>`;
      }

      const popup = `
        <b>${service.name}</b>
        <span style="display:block;font-size:0.7rem;
          color:#3d5a73;margin-bottom:5px">
          ${service.type.toUpperCase()} · ${service.distance_km} km
        </span>
        ${extra}
        <a href="tel:${service.phone}"
          style="font-size:0.82rem;color:#10b981">
          📞 ${service.phone}
        </a><br>
        <span
          style="font-size:0.7rem;color:#14b8a6;cursor:pointer;
            margin-top:4px;display:inline-block;"
          onclick="window.__setDest(
            ${service.lat},${service.lon},
            '${service.name.replace(/'/g, "\\'")}')">
          ⟶ Set as destination
        </span>`;

      L.marker([service.lat, service.lon], {
        icon: makeIcon(service.type),
      })
        .bindPopup(popup, { maxWidth: 230 })
        .addTo(layers.services);
    },

    // Report markers
    addReportMarker(report) {
      const popup = `
        <b>${report.type.toUpperCase()}</b>
        <span style="display:block;font-size:0.7rem;color:#3d5a73">
          ${new Date(report.timestamp).toLocaleString()}
        </span>
        <span style="font-size:0.78rem">${report.description}</span>`;
      L.marker([report.lat, report.lon], {
        icon: makeIcon(report.type),
      })
        .bindPopup(popup)
        .addTo(layers.reports);
    },

    // Draw polyline — GeoJSON [lon,lat] → Leaflet [lat,lon]
    // Fastest = amber dashed, Safest = emerald solid
    drawRoute(coords, layer, color, dashArray = null) {
      const latLngs = coords.map(([ln, lt]) => [lt, ln]);
      const poly = L.polyline(latLngs, {
        color,
        weight:    7,
        opacity:   0.9,
        dashArray,
        lineCap:   "round",
        lineJoin:  "round",
      }).addTo(layers[layer]);
      map.fitBounds(poly.getBounds(), { padding: [70, 70] });
    },

    // Uber/Rapido style live tracking dot
    createLiveDot(lat, lon) {
      const icon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:24px;height:24px;">
            <div style="
              position:absolute;inset:-7px;border-radius:50%;
              background:rgba(14,165,233,0.18);
              animation:dotRing 1.6s ease-out infinite;
            "></div>
            <div style="
              position:absolute;inset:-14px;border-radius:50%;
              background:rgba(14,165,233,0.07);
              animation:dotRing 1.6s ease-out infinite;
              animation-delay:0.5s;
            "></div>
            <div style="
              width:24px;height:24px;border-radius:50%;
              background:#0ea5e9;
              border:3px solid #fff;
              box-shadow:0 0 18px rgba(14,165,233,0.9),
                0 2px 8px rgba(0,0,0,0.5);
            "></div>
          </div>
          <style>
            @keyframes dotRing{
              0%{transform:scale(0.5);opacity:0.8}
              100%{transform:scale(2.4);opacity:0}
            }
          </style>`,
        iconSize:    [24, 24],
        iconAnchor:  [12, 12],
        popupAnchor: [0, -14],
      });
      return L.marker([lat, lon], {
        icon,
        zIndexOffset: 3000,
      })
        .bindTooltip("📍 You are here", {
          permanent: false,
          direction: "top",
        })
        .addTo(this.map);
    },
  };
})();

// Global helper so popup "Set as destination" link works
window.__setDest = (lat, lon, name) => {
  window.dispatchEvent(new CustomEvent("setDestFromMap", {
    detail: { lat, lon, name, id: name },
  }));
};
  