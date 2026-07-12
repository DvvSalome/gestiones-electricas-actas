// Geolocalización en tiempo real + minimapa (Leaflet / OpenStreetMap)
let geoMap = null, geoMarker = null, geoAccuracyCircle = null, geoWatchId = null;

function setMapStatus(text, color) {
  const label = document.getElementById("mini-map-label");
  const dot = document.getElementById("mini-map-dot");
  if (label) label.textContent = text;
  if (dot) dot.style.background = color;
}

// Inicializa el mapa SIN marcador (solo la vista). El marcador se pone
// únicamente cuando llega una posición real del GPS.
function ensureMap(lat, lng, zoom) {
  if (geoMap || typeof L === "undefined") return;
  const el = document.getElementById("mini-map");
  if (!el) return;
  geoMap = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    .setView([lat, lng], zoom || 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap",
  }).addTo(geoMap);
  setTimeout(() => { if (geoMap) geoMap.invalidateSize(); }, 250);
}

// Coloca/mueve el marcador SOLO con una posición real. Muestra el círculo de
// precisión y ajusta el zoom según qué tan exacta sea la lectura.
function updateMapPosition(lat, lng, accuracy) {
  ensureMap(lat, lng, 16);
  if (!geoMap) return;

  if (!geoMarker) geoMarker = L.marker([lat, lng]).addTo(geoMap);
  else geoMarker.setLatLng([lat, lng]);

  if (typeof accuracy === "number" && accuracy > 0) {
    if (!geoAccuracyCircle) {
      geoAccuracyCircle = L.circle([lat, lng], { radius: accuracy, color: "#3b7d2f", fillColor: "#7dbf5a", fillOpacity: 0.15, weight: 1 }).addTo(geoMap);
    } else {
      geoAccuracyCircle.setLatLng([lat, lng]);
      geoAccuracyCircle.setRadius(accuracy);
    }
  }

  const zoom = accuracy <= 50 ? 17 : accuracy <= 300 ? 15 : 13;
  geoMap.setView([lat, lng], zoom);
}

function initGPSData() {
  const now = new Date();
  const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  window.gpsTimeDisplay.textContent = now.toLocaleDateString('es-CO', options);

  // Vista regional inicial (Atlántico), SIN marcador, mientras llega el GPS.
  ensureMap(10.99, -74.87, 11);
  setMapStatus("Buscando tu ubicación… activa el GPS", "#f59e0b");

  if (!navigator.geolocation) {
    window.gpsCoordsDisplay.textContent = "GPS no soportado en dispositivo";
    setMapStatus("GPS no soportado", "#c0402f");
    return;
  }

  const onOk = (position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const acc = position.coords.accuracy; // metros

    window.gpsLat = lat;
    window.gpsLng = lng;
    window.gpsAccuracy = acc;
    const coordsStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    window.gpsCoordsDisplay.textContent = coordsStr;
    localStorage.setItem("ge_last_gps", coordsStr);

    updateMapPosition(lat, lng, acc);

    const dot = document.getElementById("gps-status-dot");
    if (acc <= 60) {
      setMapStatus(`Ubicación precisa · ±${Math.round(acc)} m`, "#34c759");
      if (dot) { dot.style.backgroundColor = "var(--brand-ok)"; dot.style.boxShadow = "0 0 8px var(--brand-ok)"; }
    } else {
      // Lectura de red/aproximada: se marca, pero se avisa que NO es precisa.
      setMapStatus(`Aproximada · ±${Math.round(acc)} m — activa "ubicación precisa"`, "#f59e0b");
      if (dot) { dot.style.backgroundColor = "var(--brand-warn)"; dot.style.boxShadow = "0 0 8px var(--brand-warn)"; }
    }
  };

  const onErr = (error) => {
    if (window.gpsLat != null) return; // ya tenemos una posición real; ignorar errores posteriores
    let msg = "No se pudo obtener la ubicación";
    if (error) {
      if (error.code === 1) msg = "Permiso de ubicación denegado — actívalo";
      else if (error.code === 2) msg = "Sin señal GPS — sal a cielo abierto";
      else if (error.code === 3) msg = "Buscando señal GPS…";
    }
    setMapStatus(msg, "#f59e0b");
    const dot = document.getElementById("gps-status-dot");
    if (dot) { dot.style.backgroundColor = "var(--brand-warn)"; dot.style.boxShadow = "0 0 8px var(--brand-warn)"; }
    // NO se pone marcador ni una coordenada falsa: mientras no haya GPS real,
    // la ubicación queda como no disponible (honesto en el acta).
    const cur = window.gpsCoordsDisplay.textContent || "";
    if (!window.gpsLat && (cur.indexOf("Localizando") >= 0 || cur.trim() === "")) {
      window.gpsCoordsDisplay.textContent = "Ubicación no disponible — activa el GPS";
    }
  };

  // Posición inicial rápida + seguimiento continuo en tiempo real.
  navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  geoWatchId = navigator.geolocation.watchPosition(onOk, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 27000 });
}
