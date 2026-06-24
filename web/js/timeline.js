// --- Timeline Status Bar ---
function updateTimelineProgress() {
  const dotInfo = document.getElementById("dot-info");
  const dotCheck = document.getElementById("dot-check");
  const dotPhoto = document.getElementById("dot-photo");
  const dotSign = document.getElementById("dot-sign");

  // Paso 1: Datos cliente y técnico
  const cliente = document.getElementById("field-cliente").value.trim();
  const tecnico = document.getElementById("field-tecnico").value.trim();
  const infoOk = cliente.length > 2 && tecnico.length > 2;

  // Paso 2: Checklist e inputs técnicos
  const diagnostico = document.getElementById("field-diagnostico").value.trim();
  const checkOk = diagnostico.length > 2;

  // Paso 3: Evidencia fotográfica (al menos una foto)
  const photoOk = window.imagesInMemory.antes || window.imagesInMemory.despues || window.imagesInMemory.detalle || window.imagesInMemory.adicional;

  // Paso 4: Firma
  const signOk = window.signatureConfirmed;

  // Actualizar dots
  if (dotInfo) dotInfo.className = "progress-dot" + (infoOk ? " active" : "");
  if (dotCheck) dotCheck.className = "progress-dot" + (checkOk ? " active" : "");
  if (dotPhoto) dotPhoto.className = "progress-dot" + (photoOk ? " active" : "");
  if (dotSign) dotSign.className = "progress-dot" + (signOk ? " active" : "");

  // Determinar en qué paso estamos para la etiqueta
  if (!infoOk) {
    window.progressTextDisplay.textContent = "Paso 1 de 4 — Datos del Cliente";
    if (dotInfo) dotInfo.className = "progress-dot active";
  } else if (!checkOk) {
    window.progressTextDisplay.textContent = "Paso 2 de 4 — Diagnóstico y Checklist";
    if (dotCheck) dotCheck.className = "progress-dot active";
  } else if (!photoOk) {
    window.progressTextDisplay.textContent = "Paso 3 de 4 — Evidencia Fotográfica";
    if (dotPhoto) dotPhoto.className = "progress-dot active";
  } else if (!signOk) {
    window.progressTextDisplay.textContent = "Paso 4 de 4 — Firma y Conformidad";
    if (dotSign) dotSign.className = "progress-dot active";
  } else {
    window.progressTextDisplay.textContent = "¡Todo Listo para Descargar! ⚡";
  }
}
