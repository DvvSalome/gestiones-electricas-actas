// --- Lógica del Canvas para Firma ---
// El ancho de este canvas (bloque 05, "Conformidad del Cliente") puede
// quedar en 0 según el momento exacto en que setupCanvas() corrió — la
// misma inestabilidad de layout documentada más abajo para el canvas del
// técnico, verificada aquí con el mismo síntoma: el trazo se dibuja pero
// isCanvasBlank() lo ve vacío porque el buffer real tiene ancho 0. Se
// corrige de forma perezosa justo antes de cada trazo, igual que
// ensureTecnicoCanvasSized().
function ensureCanvasSized() {
  const canvas = window.canvasElement;
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (canvas.width !== rect.width || canvas.height !== rect.height) {
    const hadDrawing = !isCanvasBlank(canvas);
    const prevImage = hadDrawing ? canvas.toDataURL("image/png") : null;
    canvas.width = rect.width;
    canvas.height = rect.height;
    window.ctx.strokeStyle = "#0D1100";
    window.ctx.lineWidth = 3;
    window.ctx.lineCap = "round";
    window.ctx.lineJoin = "round";
    if (prevImage) {
      const img = new Image();
      img.onload = () => window.ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = prevImage;
    }
  }
  return true;
}

function setupCanvas() {
  const canvas = window.canvasElement;
  ensureCanvasSized();

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

  // F-móvil: el navegador puede cancelar un touch a mitad de trazo (gesto del
  // sistema, notificación, el propio Safari/Chrome desambiguando si es un
  // scroll) — dispara "touchcancel" en vez de "touchend". Sin este listener,
  // isDrawing se quedaba en true para siempre y capturarFirma() nunca corría:
  // el técnico veía el trazo dibujado pero la firma jamás quedaba confirmada,
  // y no había botón manual para forzarlo. Se trata igual que un touchend.
  canvas.addEventListener("touchcancel", (e) => {
    canvas.dispatchEvent(new MouseEvent("mouseup", {}));
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
  if (!ensureCanvasSized()) return; // no visible en este instante, ignorar el trazo
  window.isDrawing = true;
  const pos = getMousePos(window.canvasElement, e);
  window.ctx.beginPath();
  window.ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!window.isDrawing) return;
  const pos = getMousePos(window.canvasElement, e);
  window.ctx.lineTo(pos.x, pos.y);
  window.ctx.stroke();
}

// Ya no hay botón "Confirmar Firma": cada trazo se auto-captura al soltar el
// lápiz/dedo. "Guardar cambios" (startPdfProcess) es quien de verdad la
// envía al servidor — esto solo mantiene el estado local/visual al día.
function stopDrawing() {
  window.isDrawing = false;
  capturarFirma();
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

function capturarFirma() {
  ensureCanvasSized();
  if (isCanvasBlank(window.canvasElement)) return; // nada dibujado, no hay nada que capturar
  window.signatureConfirmed = true;
  window.signatureDataURL = window.canvasElement.toDataURL("image/png");

  const statusTxt = document.getElementById("signature-status-txt");
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hrs`;
  statusTxt.textContent = `✅ Firmado - ${timeStr}`;
  statusTxt.classList.add("confirmed");

  localStorage.setItem("ge_signature", window.signatureDataURL);
  updateTimelineProgress();
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

  // Ver comentario equivalente en setupCanvas() — mismo fix para el pad del técnico.
  canvas.addEventListener("touchcancel", (e) => {
    canvas.dispatchEvent(new MouseEvent("mouseup", {}));
    e.preventDefault();
  }, { passive: false });
}

function startDrawingTecnico(e) {
  if (!ensureTecnicoCanvasSized()) return; // no visible en este instante, ignorar el trazo
  window.isDrawingTecnico = true;
  const pos = getMousePos(window.tecnicoCanvasElement, e);
  window.tecnicoCtx.beginPath();
  window.tecnicoCtx.moveTo(pos.x, pos.y);
}

function drawTecnico(e) {
  if (!window.isDrawingTecnico) return;
  const pos = getMousePos(window.tecnicoCanvasElement, e);
  window.tecnicoCtx.lineTo(pos.x, pos.y);
  window.tecnicoCtx.stroke();
}

// Igual que stopDrawing() del cliente: sin botón de confirmar, se auto-captura
// al soltar el trazo.
function stopDrawingTecnico() {
  window.isDrawingTecnico = false;
  capturarFirmaTecnico();
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

function capturarFirmaTecnico() {
  if (!window.tecnicoCanvasElement) return; // sección no presente en esta vista
  ensureTecnicoCanvasSized();
  if (isCanvasBlank(window.tecnicoCanvasElement)) return;
  window.tecnicoSignatureConfirmed = true;
  window.tecnicoSignatureDataURL = window.tecnicoCanvasElement.toDataURL("image/png");

  const statusTxt = document.getElementById("signature-status-txt-tecnico");
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hrs`;
  statusTxt.textContent = `✅ Firmado - ${timeStr}`;
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
}
