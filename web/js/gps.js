// Geolocalización en tiempo real + minimapa (Leaflet / OpenStreetMap)
let geoMap = null, geoMarker = null, geoAccuracyCircle = null, geoWatchId = null;

function setMapStatus(text, color) {
  const label = document.getElementById("mini-map-label");
  const dot = document.getElementById("mini-map-dot");
  if (label) label.textContent = text;
  if (dot) dot.style.background = color;
}

function ensureMap(lat, lng) {
  if (geoMap || typeof L === "undefined") return;
  const el = document.getElementById("mini-map");
  if (!el) return;
  geoMap = L.map(el, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,   // que no haga zoom al hacer scroll del formulario
  }).setView([lat, lng], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(geoMap);
  geoMarker = L.marker([lat, lng]).addTo(geoMap);
  // El header puede cambiar de tamaño al montar; recalcular para que no salga gris.
  setTimeout(() => { if (geoMap) geoMap.invalidateSize(); }, 250);
}

function updateMapPosition(lat, lng, accuracy) {
  if (!geoMap) { ensureMap(lat, lng); }
  if (!geoMap) return;
  geoMarker.setLatLng([lat, lng]);
  // Círculo de precisión (radio en metros) para ver qué tan exacto es el GPS.
  if (typeof accuracy === "number" && accuracy > 0) {
    if (!geoAccuracyCircle) {
      geoAccuracyCircle = L.circle([lat, lng], { radius: accuracy, color: "#3b7d2f", fillColor: "#7dbf5a", fillOpacity: 0.18, weight: 1 }).addTo(geoMap);
    } else {
      geoAccuracyCircle.setLatLng([lat, lng]);
      geoAccuracyCircle.setRadius(accuracy);
    }
  }
  const z = geoMap.getZoom();
  geoMap.setView([lat, lng], z < 15 ? 16 : z);
}

function initGPSData() {
  const now = new Date();
  const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  window.gpsTimeDisplay.textContent = now.toLocaleDateString('es-CO', options);

  if (!navigator.geolocation) {
    window.gpsCoordsDisplay.textContent = "GPS no soportado en dispositivo";
    setMapStatus("GPS no soportado", "#c0402f");
    return;
  }

  const onOk = (position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const acc = position.coords.accuracy;
    const coordsStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    window.gpsLat = lat;
    window.gpsLng = lng;
    window.gpsCoordsDisplay.textContent = coordsStr;
    localStorage.setItem("ge_last_gps", coordsStr);

    const dot = document.getElementById("gps-status-dot");
    if (dot) { dot.style.backgroundColor = "var(--brand-ok)"; dot.style.boxShadow = "0 0 8px var(--brand-ok)"; }

    updateMapPosition(lat, lng, acc);
    setMapStatus(acc ? `Ubicación en vivo · ±${Math.round(acc)} m` : "Ubicación en vivo", "#34c759");
  };

  const onErr = (error) => {
    // Solo caemos al fallback si todavía no hay una posición real captada.
    if (window.gpsLat == null) {
      const fbLat = 10.9878, fbLng = -74.7889;
      window.gpsCoordsDisplay.textContent = "10.9878, -74.7889 (Barranquilla)";
      localStorage.setItem("ge_last_gps", "10.9878, -74.7889 (Barranquilla)");
      const dot = document.getElementById("gps-status-dot");
      if (dot) { dot.style.backgroundColor = "var(--brand-warn)"; dot.style.boxShadow = "0 0 8px var(--brand-warn)"; }
      ensureMap(fbLat, fbLng);
      setMapStatus("GPS sin señal · usando aprox.", "#f59e0b");
    }
  };

  // Posición inicial rápida + seguimiento continuo (tiempo real).
  navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 8000 });
  geoWatchId = navigator.geolocation.watchPosition(onOk, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
