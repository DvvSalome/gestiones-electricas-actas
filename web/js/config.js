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
