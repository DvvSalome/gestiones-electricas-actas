// Geolocalización y fecha
function initGPSData() {
  const now = new Date();
  const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const formattedDate = now.toLocaleDateString('es-CO', options);
  
  window.gpsTimeDisplay.textContent = `${formattedDate}`;

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lon = position.coords.longitude.toFixed(6);
        const coordsStr = `${lat}, ${lon}`;
        window.gpsCoordsDisplay.textContent = coordsStr;
        localStorage.setItem("ge_last_gps", coordsStr);
        document.getElementById("gps-status-dot").style.backgroundColor = "var(--brand-ok)";
        document.getElementById("gps-status-dot").style.boxShadow = "0 0 8px var(--brand-ok)";
      },
      (error) => {
        console.log("GPS no autorizado o sin señal. Usando Barranquilla por defecto.");
        const fallbackCoords = "10.9878, -74.7889 (Barranquilla)";
        window.gpsCoordsDisplay.textContent = fallbackCoords;
        localStorage.setItem("ge_last_gps", fallbackCoords);
        document.getElementById("gps-status-dot").style.backgroundColor = "var(--brand-warn)";
        document.getElementById("gps-status-dot").style.boxShadow = "0 0 8px var(--brand-warn)";
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else {
    window.gpsCoordsDisplay.textContent = "GPS no soportado en dispositivo";
  }
}
