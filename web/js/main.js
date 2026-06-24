// --- Global DOM References ---
window.canvasElement = document.getElementById("canvas-firma");
window.ctx = window.canvasElement ? window.canvasElement.getContext("2d", { willReadFrequently: true }) : null;
window.otBadgeNum = document.getElementById("ot-badge-num");
window.otField = document.getElementById("field-ot");
window.gpsCoordsDisplay = document.getElementById("gps-coords-display");
window.gpsTimeDisplay = document.getElementById("gps-time-display");
window.progressTextDisplay = document.getElementById("progress-text-display");
window.materialsTbody = document.getElementById("materials-list-tbody");

// --- Inicialización ---
window.addEventListener("DOMContentLoaded", () => {
  initOTNumber();
  initGPSData();
  setupCanvas();
  loadLocalStorageData();
  updateTimelineProgress();
  
  // Auto-guardado en inputs comunes
  const inputsToWatch = [
    "field-servicio-tipo", "field-cliente", "field-direccion",
    "field-telefono", "field-email", "field-tecnico", 
    "field-matricula", "field-diagnostico", "field-tension", 
    "field-corriente", "field-acciones", "field-norma",
    "field-firmante-nombre", "field-firmante-documento"
  ];
  
  inputsToWatch.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", saveCurrentFormToLocal);
      el.addEventListener("change", saveCurrentFormToLocal);
    }
  });

  // Escuchar cambios de radios de cumplimiento operativo final
  document.querySelectorAll('input[name="operacion-final"]').forEach(r => {
    r.addEventListener("change", saveCurrentFormToLocal);
  });
});

// Generador o cargador de N° de OT
function initOTNumber() {
  let ot = localStorage.getItem("ge_current_ot");
  if (!ot) {
    // Generar un número aleatorio para OT
    const rand = Math.floor(1000 + Math.random() * 9000);
    ot = `OT-${rand}`;
    localStorage.setItem("ge_current_ot", ot);
  }
  if (window.otBadgeNum) window.otBadgeNum.textContent = ot;
  if (window.otField) window.otField.value = ot;
}
