// --- Barra de pasos (steps-bar) ---
// Antes eran 4 puntos genéricos ("dot-info/check/photo/sign") con un texto
// aparte ("Paso X de 4 — ..."). El rediseño junta el checklist y "Acciones y
// Materiales" (que antes compartían el paso "check") en dos pasos separados
// con su propio nombre — el técnico ve exactamente cuál de los cinco bloques
// le falta, no solo "Datos/Checklist/Evidencia/Firma" a medias.
function updateTimelineProgress() {
  const pips = {
    datos: document.getElementById("step-datos"),
    checklist: document.getElementById("step-checklist"),
    materiales: document.getElementById("step-materiales"),
    evidencia: document.getElementById("step-evidencia"),
    firma: document.getElementById("step-firma"),
  };

  // Paso 1: Datos cliente y técnico
  // #field-cliente ya no existe (rediseño combo) — la identidad del cliente
  // vive en window.clienteActual, no en un input de texto (ver historial-cliente.js).
  const cliente = window.clienteActual ? window.clienteActual.nombre.trim() : "";
  const tecnico = document.getElementById("field-tecnico").value.trim();
  const datosOk = cliente.length > 2 && tecnico.length > 2;

  // Paso 2: Checklist (diagnóstico técnico del sistema)
  const diagnostico = document.getElementById("field-diagnostico").value.trim();
  const checklistOk = diagnostico.length > 2;

  // Paso 3: Acciones y Materiales (acciones correctivas ejecutadas)
  const acciones = document.getElementById("field-acciones").value.trim();
  const materialesOk = acciones.length > 2;

  // Paso 4: Evidencia fotográfica (al menos una foto)
  const evidenciaOk = window.imagesInMemory.antes || window.imagesInMemory.despues || window.imagesInMemory.detalle || window.imagesInMemory.adicional;

  // Paso 5: Firma (cliente — la firma del técnico es adicional, ver F-firma-tecnico)
  const firmaOk = window.signatureConfirmed;

  const orden = ["datos", "checklist", "materiales", "evidencia", "firma"];
  const hechos = { datos: datosOk, checklist: checklistOk, materiales: materialesOk, evidencia: evidenciaOk, firma: firmaOk };
  let activo = null;
  orden.forEach((k) => {
    const pip = pips[k];
    if (!pip) return;
    pip.classList.remove("active", "done");
    if (hechos[k]) pip.classList.add("done");
    else if (activo === null) { activo = k; pip.classList.add("active"); }
  });

  const LABEL = { datos: "Datos", checklist: "Checklist", materiales: "Materiales", evidencia: "Evidencia", firma: "Firma" };
  const display = document.getElementById("progress-text-display");
  if (!display) return;
  if (activo === null) {
    display.textContent = "¡Todo listo para descargar!";
  } else {
    const i = orden.indexOf(activo);
    display.textContent = `Paso ${i + 1} de ${orden.length} — ${LABEL[activo]}`;
  }
}
