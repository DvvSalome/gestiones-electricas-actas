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

// Generador o cargador de N° de OT.
// F2.1: el OT lo asigna el SERVIDOR (secuencial por tenant — fin de las
// colisiones entre celulares). Si el server no responde (offline, o el deploy
// viejo de Vercel sin /api/actas), cae al aleatorio de siempre y se marca
// pendiente para reconciliar cuando vuelva la señal.
function initOTNumber() {
  let ot = localStorage.getItem("ge_current_ot");
  const uuid = localStorage.getItem("ge_current_acta_uuid");
  if (ot) {
    // acta en curso: no pedir otra (el uuid puede faltar si nació offline)
    paintOT(ot);
    return;
  }
  fetch("/api/actas", { method: "POST", headers: window.geHeaders({ "Content-Type": "application/json" }) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then(({ uuid: u, ot: serverOt }) => {
      localStorage.setItem("ge_current_ot", serverOt);
      localStorage.setItem("ge_current_acta_uuid", u);
      localStorage.removeItem("ge_ot_offline");
      paintOT(serverOt);
    })
    .catch(() => {
      // fallback: aleatorio local (comportamiento histórico) — funciona offline
      const rand = Math.floor(1000 + Math.random() * 9000);
      const localOt = `OT-${rand}`;
      localStorage.setItem("ge_current_ot", localOt);
      localStorage.setItem("ge_ot_offline", "1");
      paintOT(localOt);
    });
}

function paintOT(ot) {
  if (window.otBadgeNum) window.otBadgeNum.textContent = ot;
  if (window.otField) window.otField.value = ot;
}
