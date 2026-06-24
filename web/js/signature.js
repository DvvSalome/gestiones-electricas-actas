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

  window.signatureConfirmed = true;
  window.signatureDataURL = window.canvasElement.toDataURL("image/png");
  
  const statusTxt = document.getElementById("signature-status-txt");
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hrs`;
  statusTxt.textContent = `✅ Confirmado - ${timeStr}`;
  statusTxt.classList.add("confirmed");
  
  localStorage.setItem("ge_signature", window.signatureDataURL);
  updateTimelineProgress();

  // Guardar en la API (en segundo plano)
  saveActaToAPI();

  alert("✅ Firma confirmada con éxito. Recuerda descargar el reporte PDF y compartirlo.");
}
