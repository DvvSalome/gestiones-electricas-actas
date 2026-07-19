// Shared state variables
window.isDrawing = false;
window.signatureConfirmed = false;
window.signatureDataURL = "";

window.imagesInMemory = {
  antes: "",
  despues: "",
  detalle: "",
  adicional: ""
};

// Evidencias adicionales (más allá de las 4 fijas). Cada entrada es una clave
// dinámica ("extra-1", "extra-2", ...) cuya imagen vive también en imagesInMemory.
window.extraSlots = [];
window.extraSlotCounter = 0;
// Tope total de imágenes en el acta/PDF (4 fijas + hasta 6 adicionales).
window.MAX_TOTAL_IMAGES = 10;

window.checklistItems = [
  { id: "tablero", label: "Tablero eléctrico principal", state: "" },
  { id: "breakers", label: "Protecciones termomagnéticas (Breakers)", state: "" },
  { id: "acometida", label: "Acometida y medidores de energía", state: "" },
  { id: "conductores", label: "Conductores eléctricos y canalizaciones", state: "" },
  { id: "puesta_tierra", label: "Sistema de puesta a tierra (SPT)", state: "" },
  { id: "tomacorrientes", label: "Tomacorrientes y salidas GFCI", state: "" },
  { id: "iluminacion", label: "Iluminación y luminarias", state: "" },
  { id: "senalizacion", label: "Señalización de seguridad eléctrica", state: "" }
];

// --- F2.5: sesión del técnico (PIN) ---
// Todos los fetch al API adjuntan el Bearer si existe. 401 → se limpia la
// sesión y la compuerta de PIN reaparece (pin-gate.js).
window.geHeaders = function (extra) {
  const h = Object.assign({}, extra || {});
  const t = localStorage.getItem("ge_tecnico_token");
  if (t) h["Authorization"] = "Bearer " + t;
  return h;
};
window.geHandle401 = function (res) {
  if (res && res.status === 401) {
    localStorage.removeItem("ge_tecnico_token");
    if (typeof window.showPinGate === "function") window.showPinGate();
  }
  return res;
};
