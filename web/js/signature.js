// --- Lógica del Canvas para Firma ---
function setupCanvas() {
  const canvas = window.canvasElement;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  window.ctx.strokeStyle = "#0D1100";
  window.ctx.lineWidth = 3;
  window.ctx.lineCap = "round";
  window.ctx.lineJoin = "round";

  // Eventos Mouse
  canvas.addEventListener("mousedown", startDrawing);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stopDrawing);
  canvas.addEventListener("mouseout", stopDrawing);

  // Eventos Táctiles (Mobile)
  canvas.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    const mouseEvent = new MouseEvent("mouseup", {});
    canvas.dispatchEvent(mouseEvent);
    e.preventDefault();
  }, { passive: false });
}

function getMousePos(canvasDom, mouseEvent) {
  const rect = canvasDom.getBoundingClientRect();
  return {
    x: (mouseEvent.clientX - rect.left) * (canvasDom.width / rect.width),
    y: (mouseEvent.clientY - rect.top) * (canvasDom.height / rect.height)
  };
}

function startDrawing(e) {
  if (window.signatureConfirmed) return;
  window.isDrawing = true;
  const pos = getMousePos(window.canvasElement, e);
  window.ctx.beginPath();
  window.ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!window.isDrawing || window.signatureConfirmed) return;
  const pos = getMousePos(window.canvasElement, e);
  window.ctx.lineTo(pos.x, pos.y);
  window.ctx.stroke();
}

function stopDrawing() {
  window.isDrawing = false;
}

function clearSignature() {
  window.ctx.clearRect(0, 0, window.canvasElement.width, window.canvasElement.height);
  window.signatureConfirmed = false;
  window.signatureDataURL = "";
  const statusTxt = document.getElementById("signature-status-txt");
  statusTxt.textContent = "✍ Sin firmar";
  statusTxt.classList.remove("confirmed");
  localStorage.removeItem("ge_signature");
  updateTimelineProgress();
}

function lockSignatureAndPrompt() {
  const isBlank = isCanvasBlank(window.canvasElement);
  if (isBlank) {
    alert("Por favor, dibuje la firma antes de confirmar.");
    return;
  }

  // Nudge: si hay hallazgos de IA sin calificar, ofrecer revisarlos ANTES de
  // firmar (la calificación entrena al motor). El técnico puede seguir igual.
  if (window.diagNudgeAntesDeFirmar && window.diagPendientes && window.diagPendientes() > 0) {
    return window.diagNudgeAntesDeFirmar(confirmarFirma);
  }
  confirmarFirma();
}

function confirmarFirma() {
  window.signatureConfirmed = true;
  window.signatureDataURL = window.canvasElement.toDataURL("image/png");

  const statusTxt = document.getElementById("signature-status-txt");
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hrs`;
  statusTxt.textContent = `✅ Confirmado - ${timeStr}`;
  statusTxt.classList.add("confirmed");

  localStorage.setItem("ge_signature", window.signatureDataURL);
  updateTimelineProgress();

  // F2.3: la firma viaja al servidor en el momento de confirmarla (PNG +
  // timestamp + gps) — fire-and-forget: sin señal, el PDF local la conserva.
  uploadFirmaToServer();
}

// --- Firma del TÉCNICO (F6.3) — mismo patrón que la firma del cliente, con
// su propio canvas/estado, para no arriesgar el flujo del cliente que ya
// está en producción. Certifica que el técnico ejecutó el servicio; el
// PDF la imprime en la sección "TÉCNICO AUTORIZADO" en vez de solo texto. ---
// El ancho de esta sección (agregada después del canvas del cliente, más
// abajo en una página larga con secciones que se re-maquetan mientras el
// técnico llena el acta) fluctúa a 0 según el momento — no es un problema de
// "todavía no cargó", es inestable durante toda la sesión. Por eso el tamaño
// del canvas NO se fija una sola vez al cargar: se corrige de forma perezosa
// justo antes de cada trazo, que es el único momento en que el elemento
// GARANTIZADO es visible (el técnico lo está tocando).
function ensureTecnicoCanvasSized() {
  const canvas = window.tecnicoCanvasElement;
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false; // no visible ahora mismo
  if (canvas.width !== rect.width || canvas.height !== rect.height) {
    // Cambiar canvas.width/height BORRA el contenido — solo se hace si de
    // verdad cambió, para no perder un trazo ya dibujado.
    const hadDrawing = !isCanvasBlank(canvas);
    const prevImage = hadDrawing ? canvas.toDataURL("image/png") : null;
    canvas.width = rect.width;
    canvas.height = rect.height;
    window.tecnicoCtx.strokeStyle = "#0D1100";
    window.tecnicoCtx.lineWidth = 3;
    window.tecnicoCtx.lineCap = "round";
    window.tecnicoCtx.lineJoin = "round";
    if (prevImage) {
      const img = new Image();
      img.onload = () => window.tecnicoCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = prevImage;
    }
  }
  return true;
}

function setupTecnicoCanvas() {
  const canvas = document.getElementById("canvas-firma-tecnico");
  if (!canvas) return; // sección no presente en esta vista
  window.tecnicoCanvasElement = canvas;
  window.tecnicoCtx = canvas.getContext("2d");
  window.tecnicoCtx.strokeStyle = "#0D1100";
  window.tecnicoCtx.lineWidth = 3;
  window.tecnicoCtx.lineCap = "round";
  window.tecnicoCtx.lineJoin = "round";
  ensureTecnicoCanvasSized();

  canvas.addEventListener("mousedown", startDrawingTecnico);
  canvas.addEventListener("mousemove", drawTecnico);
  canvas.addEventListener("mouseup", stopDrawingTecnico);
  canvas.addEventListener("mouseout", stopDrawingTecnico);

  canvas.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: touch.clientX, clientY: touch.clientY }));
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: touch.clientX, clientY: touch.clientY }));
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    canvas.dispatchEvent(new MouseEvent("mouseup", {}));
    e.preventDefault();
  }, { passive: false });
}

function startDrawingTecnico(e) {
  if (window.tecnicoSignatureConfirmed) return;
  if (!ensureTecnicoCanvasSized()) return; // no visible en este instante, ignorar el trazo
  window.isDrawingTecnico = true;
  const pos = getMousePos(window.tecnicoCanvasElement, e);
  window.tecnicoCtx.beginPath();
  window.tecnicoCtx.moveTo(pos.x, pos.y);
}

function drawTecnico(e) {
  if (!window.isDrawingTecnico || window.tecnicoSignatureConfirmed) return;
  const pos = getMousePos(window.tecnicoCanvasElement, e);
  window.tecnicoCtx.lineTo(pos.x, pos.y);
  window.tecnicoCtx.stroke();
}

function stopDrawingTecnico() {
  window.isDrawingTecnico = false;
}

function clearSignatureTecnico() {
  window.tecnicoCtx.clearRect(0, 0, window.tecnicoCanvasElement.width, window.tecnicoCanvasElement.height);
  window.tecnicoSignatureConfirmed = false;
  window.tecnicoSignatureDataURL = "";
  const statusTxt = document.getElementById("signature-status-txt-tecnico");
  statusTxt.textContent = "✍ Sin firmar";
  statusTxt.classList.remove("confirmed");
  localStorage.removeItem("ge_signature_tecnico");
  updateTimelineProgress();
}

function confirmarFirmaTecnico() {
  ensureTecnicoCanvasSized();
  const isBlank = isCanvasBlank(window.tecnicoCanvasElement);
  if (isBlank) {
    alert("Por favor, dibuje la firma del técnico antes de confirmar.");
    return;
  }
  window.tecnicoSignatureConfirmed = true;
  window.tecnicoSignatureDataURL = window.tecnicoCanvasElement.toDataURL("image/png");

  const statusTxt = document.getElementById("signature-status-txt-tecnico");
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hrs`;
  statusTxt.textContent = `✅ Confirmado - ${timeStr}`;
  statusTxt.classList.add("confirmed");

  localStorage.setItem("ge_signature_tecnico", window.tecnicoSignatureDataURL);
  updateTimelineProgress();
}

function uploadFirmaToServer() {
  const uuid = localStorage.getItem("ge_current_acta_uuid");
  if (!window.signatureDataURL) return;
  const payload = {
    firma: window.signatureDataURL,
    gps: window.gpsLat != null ? `${window.gpsLat},${window.gpsLng}` : "",
  };
  const enqueue = () => window.queueOffline && window.queueOffline({ kind: "firma", uuid: uuid || null, json: payload });
  if (!uuid || !navigator.onLine) return enqueue(); // F2.4: sin señal → a la cola
  fetch(`/api/actas/${uuid}/firma`, {
    method: "POST",
    headers: window.geHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  }).then((r) => { if (!r.ok && r.status !== 400) enqueue(); }).catch(enqueue);

  alert("✅ Firma confirmada con éxito. Recuerda descargar el reporte PDF y compartirlo.");
}
