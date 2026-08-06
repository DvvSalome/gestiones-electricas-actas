// --- Compilar datos de pantalla hacia la plantilla A4 del PDF ---
function preparePrintableTemplate() {
  const otNum = window.otBadgeNum.textContent;
  document.getElementById("pdf-ot-val").textContent = otNum;
  document.getElementById("pdf-ot-val2").textContent = otNum;
  
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} hrs`;
  document.getElementById("pdf-date-val").textContent = `Fecha: ${dateStr} - Hora: ${timeStr}`;

  // Identificación
  document.getElementById("pdf-cliente-val").textContent = document.getElementById("field-cliente").value || "— No especificado —";
  document.getElementById("pdf-direccion-val").textContent = document.getElementById("field-direccion").value || "— No especificado —";
  document.getElementById("pdf-telefono-val").textContent = document.getElementById("field-telefono").value || "— No especificado —";
  document.getElementById("pdf-email-val").textContent = document.getElementById("field-email").value || "— No especificado —";
  document.getElementById("pdf-tipo-val").textContent = document.getElementById("field-servicio-tipo").value;
  document.getElementById("pdf-tecnico-val").textContent = document.getElementById("field-tecnico").value || "— No especificado —";
  document.getElementById("pdf-matricula-val").textContent = document.getElementById("field-matricula").value || "— No especificado —";
  document.getElementById("pdf-coords-val").textContent = window.gpsCoordsDisplay.textContent;

  // Diagnóstico y Mediciones
  document.getElementById("pdf-tension-val").textContent = (document.getElementById("field-tension").value || "—") + " V";
  document.getElementById("pdf-corriente-val").textContent = (document.getElementById("field-corriente").value || "—") + " A";
  document.getElementById("pdf-diagnostico-val").textContent = document.getElementById("field-diagnostico").value || "— Sin diagnóstico detallado —";

  // Normalización
  document.getElementById("pdf-acciones-val").textContent = document.getElementById("field-acciones").value || "— Sin acciones reportadas —";
  document.getElementById("pdf-norma-val").textContent = document.getElementById("field-norma").value;
  
  // Estado operativo final radio text
  const opRadio = document.querySelector('input[name="operacion-final"]:checked')?.value || "si";
  let opRadioTxt = "✅ Conforme (Operando bajo norma)";
  if (opRadio === "parcial") opRadioTxt = "⚠️ Parcial (Requiere adecuación)";
  if (opRadio === "no") opRadioTxt = "❌ No conforme (Instalación en riesgo)";
  document.getElementById("pdf-estado-final-val").textContent = opRadioTxt;

  // Checklist en PDF formato 2 columnas
  const checklistTable = document.getElementById("pdf-checklist-tbody");
  checklistTable.innerHTML = "";
  
  for (let i = 0; i < window.checklistItems.length; i += 2) {
    const item1 = window.checklistItems[i];
    const item2 = window.checklistItems[i+1];
    
    let state1Html = `<span class="pdf-badge empty">No Evaluado</span>`;
    if (item1.state === "ok") state1Html = `<span class="pdf-badge ok">Conforme</span>`;
    if (item1.state === "fail") state1Html = `<span class="pdf-badge fail">Falla</span>`;

    let state2Html = "";
    let label2 = "";
    if (item2) {
      label2 = item2.label;
      state2Html = `<span class="pdf-badge empty">No Evaluado</span>`;
      if (item2.state === "ok") state2Html = `<span class="pdf-badge ok">Conforme</span>`;
      if (item2.state === "fail") state2Html = `<span class="pdf-badge fail">Falla</span>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="width: 35%; font-weight: bold;">${item1.label}</td>
      <td style="width: 15%; text-align: center;">${state1Html}</td>
      <td style="width: 35%; font-weight: bold;">${label2}</td>
      <td style="width: 15%; text-align: center;">${state2Html}</td>
    `;
    checklistTable.appendChild(tr);
  }

  // Insumos y materiales en PDF
  const pdfMaterialsTbody = document.getElementById("pdf-materials-tbody");
  pdfMaterialsTbody.innerHTML = "";
  const rows = Array.from(window.materialsTbody.querySelectorAll("tr"));
  
  let addedMaterialsCount = 0;
  rows.forEach(tr => {
    const desc = tr.querySelector(".desc-input").value.trim();
    const cant = tr.querySelector(".cant-input").value.trim();
    const ref = tr.querySelector(".ref-input").value.trim();
    
    if (desc || cant || ref) {
      addedMaterialsCount++;
      const trPdf = document.createElement("tr");
      trPdf.innerHTML = `
        <td>${desc || "—"}</td>
        <td>${cant || "1"}</td>
        <td>${ref || "—"}</td>
      `;
      pdfMaterialsTbody.appendChild(trPdf);
    }
  });
  
  if (addedMaterialsCount === 0) {
    pdfMaterialsTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #9CA3AF;">Ningún material o insumo registrado para esta intervención.</td></tr>`;
  }

  // Cargar imágenes en PDF: 4 fijas (con placeholder si faltan) + evidencias
  // adicionales dinámicas (solo las que tengan foto). Se reconstruye todo el grid.
  const pdfGrid = document.getElementById("pdf-photo-grid");
  if (pdfGrid) {
    const fixed = [
      { key: "antes",     label: "Foto Antes de la Intervención" },
      { key: "despues",   label: "Foto Después de la Normalización" },
      { key: "detalle",   label: "Detalle Técnico (Tablero / Equipo)" },
      { key: "adicional", label: "Evidencia Adicional / Reporte" },
    ];

    let html = "";
    fixed.forEach(s => {
      const img = window.imagesInMemory[s.key];
      const inner = img
        ? `<img src="${img}" class="pdf-photo-img">`
        : `<div class="pdf-photo-placeholder">Sin Imagen Adjunta</div>`;
      html += `<div class="pdf-photo-container">${inner}<span class="pdf-photo-label">${s.label}</span></div>`;
    });

    let n = 0;
    (window.extraSlots || []).forEach(key => {
      const img = window.imagesInMemory[key];
      if (!img) return;
      n++;
      html += `<div class="pdf-photo-container"><img src="${img}" class="pdf-photo-img"><span class="pdf-photo-label">Evidencia Complementaria ${n}</span></div>`;
    });

    pdfGrid.innerHTML = html;
  }

  // Firmas en PDF
  const pdfTecnicoNombre = document.getElementById("pdf-firmante-tecnico-nombre");
  const pdfTecnicoMatricula = document.getElementById("pdf-firmante-tecnico-matricula");
  const pdfGpsTecnicoTime = document.getElementById("pdf-gps-tecnico-time");
  
  pdfTecnicoNombre.textContent = document.getElementById("field-tecnico").value || "Ing./Téc. Asignado";
  pdfTecnicoMatricula.textContent = "Matrícula: " + (document.getElementById("field-matricula").value || "CONTE / RETIE");
  pdfGpsTecnicoTime.textContent = `Firma Geolocalizada: ${window.gpsCoordsDisplay.textContent} · ${timeStr}`;

  const pdfClienteNombre = document.getElementById("pdf-firmante-cliente-nombre");
  const pdfClienteDocumento = document.getElementById("pdf-firmante-cliente-documento");
  const pdfGpsClienteTime = document.getElementById("pdf-gps-cliente-time");
  const pdfSignatureImgBox = document.getElementById("pdf-signature-img-box");
  
  pdfClienteNombre.textContent = document.getElementById("field-firmante-nombre").value || "Responsable de Recibir";
  pdfClienteDocumento.textContent = "C.C. / NIT: " + (document.getElementById("field-firmante-documento").value || "— No especificado —");
  pdfGpsClienteTime.textContent = `Registro: ${window.gpsCoordsDisplay.textContent} · ${dateStr} ${timeStr}`;

  pdfSignatureImgBox.innerHTML = "";
  if (window.signatureConfirmed && window.signatureDataURL) {
    pdfSignatureImgBox.innerHTML = `<img src="${window.signatureDataURL}" class="pdf-signature-image">`;
  } else {
    pdfSignatureImgBox.innerHTML = `<div class="pdf-signature-empty">PENDIENTE DE FIRMA</div>`;
  }

  // F6.2: acceso al Portal del Cliente — solo aparece si esta acta generó una
  // sede nueva (window.portalAccess). Sedes que ya existían no traen nada
  // nuevo que mostrar aquí: su acceso ya se entregó en una acta anterior.
  const portalAccessTitle = document.getElementById("pdf-portal-access-title");
  const portalAccessBox = document.getElementById("pdf-portal-access");
  if (window.portalAccess && window.portalAccess.username && window.portalAccess.password) {
    document.getElementById("pdf-portal-access-user").textContent = window.portalAccess.username;
    document.getElementById("pdf-portal-access-pass").textContent = window.portalAccess.password;
    document.getElementById("pdf-portal-access-link").textContent =
      window.portalAccess.url ? window.portalAccess.url.replace(/^https?:\/\//, "") : "electroscan.gestioneselectricas.com/p/login";
    portalAccessTitle.style.display = "";
    portalAccessBox.style.display = "";
  } else {
    portalAccessTitle.style.display = "none";
    portalAccessBox.style.display = "none";
  }
}

// --- Validaciones generales para exportar/compartir ---
function validateFormForExport(actionName = "exportar") {
  const cliente = document.getElementById("field-cliente").value.trim();
  const direccion = document.getElementById("field-direccion").value.trim();
  const tecnico = document.getElementById("field-tecnico").value.trim();
  const diagnostico = document.getElementById("field-diagnostico").value.trim();
  const acciones = document.getElementById("field-acciones").value.trim();
  const firmante = document.getElementById("field-firmante-nombre").value.trim();
  const documento = document.getElementById("field-firmante-documento").value.trim();

  if (!cliente || !direccion || !tecnico || !diagnostico || !acciones) {
    alert(`⚠️ Por favor complete todos los campos obligatorios del reporte antes de ${actionName}.`);
    return false;
  }

  if (!window.signatureConfirmed || !firmante || !documento) {
    alert(`⚠️ El cliente debe firmar el documento e ingresar su nombre/identificación antes de ${actionName}.`);
    return false;
  }
  return true;
}

// --- Generación de PDF usando html2canvas + jsPDF directamente ---
// (sin html2pdf, cuyo container interno overflow:hidden recortaba el contenido)
async function generatePdfBlob(fileName) {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.style.display = "none";

  preparePrintableTemplate();

  const originalTemplate = document.getElementById("pdf-printable-template");
  const clone = originalTemplate.cloneNode(true);
  clone.style.display = "block";

  // Wrapper off-screen: html2canvas captura desde x=-9999 donde no hay nada
  // más en la página, así que el overlay (en x=0) no interfiere.
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute; left:-9999px; top:0; width:794px; background:white;";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // ── Incrustar el minimapa en la ficha (si hay ubicación real captada) ──
    try {
      const mapEl = document.getElementById("mini-map");
      const tieneMarcador = mapEl && mapEl.querySelector(".leaflet-marker-icon");
      if (mapEl && window.gpsLat != null && tieneMarcador) {
        const zc = mapEl.querySelector(".leaflet-control-zoom");
        const prevZc = zc ? zc.style.display : null;
        if (zc) zc.style.display = "none"; // ocultar botones +/- en la captura
        const mapCanvas = await html2canvas(mapEl, { useCORS: true, logging: false, scale: 2, backgroundColor: "#e6ebe1" });
        if (zc) zc.style.display = prevZc || "";
        const mapUrl = mapCanvas.toDataURL("image/jpeg", 0.85);
        const cloneImg = clone.querySelector("#pdf-map-img");
        const cloneBox = clone.querySelector("#pdf-map-box");
        if (cloneImg && cloneBox) {
          await new Promise((res) => { cloneImg.onload = res; cloneImg.onerror = res; cloneImg.src = mapUrl; });
          cloneBox.style.display = "block";
        }
      }
    } catch (e) {
      console.warn("No se pudo incrustar el minimapa en el PDF:", e);
    }

    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 794
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const pageW   = pdf.internal.pageSize.getWidth();   // 210 mm
    const pageH   = pdf.internal.pageSize.getHeight();  // 297 mm
    const pxPerMm = canvas.width / pageW;
    const pageHpx = pageH * pxPerMm;

    // ── Zonas que NO se deben partir en un salto de página (imágenes + mapa) ──
    // Se miden en px del canvas para ajustar cada corte y no cortar una foto.
    const sf = canvas.width / wrapper.offsetWidth; // factor px CSS -> px canvas
    const wrapTop = wrapper.getBoundingClientRect().top;
    const avoidZones = [];
    clone.querySelectorAll(".pdf-photo-container, #pdf-map-box").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height < 5) return;
      avoidZones.push({ top: (r.top - wrapTop) * sf, bottom: (r.bottom - wrapTop) * sf });
    });
    avoidZones.sort((a, b) => a.top - b.top);

    let srcY = 0;
    let page = 0;

    while (srcY < canvas.height) {
      let pageEnd = Math.min(srcY + pageHpx, canvas.height);

      // Si el corte de página cae DENTRO de una imagen, subir el corte al inicio
      // de esa imagen para que pase entera a la página siguiente.
      if (pageEnd < canvas.height) {
        for (const z of avoidZones) {
          if (z.top < pageEnd - 1 && z.bottom > pageEnd + 1) {
            if (z.top > srcY + 120) pageEnd = Math.floor(z.top); // no dejar la página casi vacía
            break;
          }
        }
      }

      const sliceH = pageEnd - srcY;
      if (sliceH <= 0) break; // seguridad anti-bucle

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width  = canvas.width;
      pageCanvas.height = sliceH;
      pageCanvas.getContext("2d").drawImage(
        canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH
      );

      if (page > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.95), "JPEG",
        0, 0, pageW, sliceH / pxPerMm);

      srcY = pageEnd;
      page++;
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(wrapper);
  }
}

// Variables globales para almacenar el PDF compilado
window.lastGeneratedPdfBlob = null;
window.lastGeneratedPdfFileName = "";

// --- Guardado en Base de Datos Global (trazabilidad para el panel) ---
function saveFormDataToBackend() {
  try {
    const g = (id) => (document.getElementById(id)?.value || "").trim();
    const countImgs = () => {
      let n = 0;
      ["antes", "despues", "detalle", "adicional"].forEach(k => { if (window.imagesInMemory[k]) n++; });
      (window.extraSlots || []).forEach(k => { if (window.imagesInMemory[k]) n++; });
      return n;
    };

    const payload = {
      ot: window.otBadgeNum ? window.otBadgeNum.textContent : "",
      cliente: g("field-cliente"),
      direccion: g("field-direccion"),
      telefono: g("field-telefono"),
      email: g("field-email"),
      tipo_servicio: g("field-servicio-tipo"),
      tecnico: g("field-tecnico"),
      matricula: g("field-matricula"),
      tension: g("field-tension"),
      corriente: g("field-corriente"),
      diagnostico: g("field-diagnostico"),
      acciones: g("field-acciones"),
      firmante_nombre: g("field-firmante-nombre"),
      firmante_documento: g("field-firmante-documento"),
      firmado: !!window.signatureConfirmed,
      num_fotos: countImgs(),
      gps: window.gpsCoordsDisplay ? window.gpsCoordsDisplay.textContent : "",
      estado_final: document.querySelector('input[name="operacion-final"]:checked')?.value || "si"
    };

    fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(e => console.error("Error guardando en backend:", e));
  } catch (err) {
    console.error("Excepción en saveFormDataToBackend:", err);
  }
}

// Función principal para iniciar la generación y abrir el diálogo Dual-State
function startPdfProcess() {
  if (!validateFormForExport("procesar el reporte")) return;

  const otNum = (window.otBadgeNum.textContent || "SN").trim().replace(/[^a-z0-9\-]/gi, "");
  const now = new Date();
  const fechaArch = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
  // Nombre del archivo: número de orden + marca del cliente (Gestiones Eléctricas) + fecha de creación.
  const fileName = `Acta_${otNum}_Gestiones_Electricas_${fechaArch}.pdf`;

  window.lastGeneratedPdfFileName = fileName;
  window.lastGeneratedPdfBlob = null;

  // El overlay NO se muestra antes de generatePdfBlob: si estuviera visible
  // (position:fixed; z-index:10000), html2canvas lo capturaría encima del
  // template y el PDF saldría en blanco. generatePdfBlob lo oculta internamente.
  document.body.style.cursor = "wait";

    generatePdfBlob(fileName)
    .then(blob => {
      window.lastGeneratedPdfBlob = blob;
      document.body.style.cursor = "";

      // Enviar respaldo silencioso a la base de datos
      saveFormDataToBackend();
      // F2.3: archivar el PDF en el servidor ("el PDF es lo que se lleva el
      // cliente; los datos son la empresa" — ahora la empresa guarda ambos)
      uploadPdfToServer(blob, fileName);

      // Mostrar directamente el Estado 2 (Acciones Disponibles)
      const overlay = document.getElementById("loading-overlay");
      const loadingContent = document.getElementById("overlay-loading-content");
      const actionContent = document.getElementById("overlay-action-content");

      if (overlay) overlay.style.display = "flex";
      if (loadingContent) loadingContent.style.display = "none";
      if (actionContent) actionContent.style.display = "flex";
    })
    .catch(err => {
      document.body.style.cursor = "";
      console.error("Error al generar PDF:", err);
      alert("❌ Ocurrió un error al compilar el reporte PDF.");
    });
}

// F2.3: sube el PDF generado al servidor (fire-and-forget; sin señal el
// técnico igual lo descarga/comparte local — F2.4 encola el reintento)
function uploadPdfToServer(blob, fileName) {
  const uuid = localStorage.getItem("ge_current_acta_uuid");
  if (!blob) return;
  const enqueue = () => window.queueOffline && window.queueOffline({ kind: "pdf", uuid: uuid || null, blob, fileName: fileName || "acta.pdf" });
  if (!uuid || !navigator.onLine) return enqueue(); // F2.4: sin señal → a la cola
  const fd = new FormData();
  fd.append("pdf", blob, fileName || "acta.pdf");
  fetch(`/api/actas/${uuid}/pdf`, { method: "POST", headers: window.geHeaders(), body: fd })
    .then((r) => { if (!r.ok && r.status !== 400) enqueue(); })
    .catch(enqueue);
}

// Handlers de los botones principales (mantenemos compatibilidad de nombres con el HTML)
function generateProfessionalPDF() {
  startPdfProcess();
}

function shareByEmail() {
  startPdfProcess();
}

function shareByWhatsApp() {
  startPdfProcess();
}

// --- Enviar el link de reseña de Google al WhatsApp del CLIENTE ---
// Así la reseña la deja el cliente desde su propio celular (con su cuenta),
// no el técnico. Toma el número del campo dedicado (o el teléfono del cliente).
function enviarResenaCliente() {
  const REVIEW_LINK = "https://g.page/r/CZfA-gPNaf91EBM/review";
  const hint = document.getElementById("resena-hint");
  const showHint = (t, ok) => {
    if (!hint) return;
    hint.style.display = "block";
    hint.style.color = ok ? "#1a8a4f" : "#c0402f";
    hint.textContent = t;
  };

  let raw = (document.getElementById("field-resena-tel")?.value || "").trim();
  if (!raw) raw = (document.getElementById("field-telefono")?.value || "").trim();

  let num = raw.replace(/\D/g, "");
  if (num.startsWith("00")) num = num.slice(2);
  // Colombia: 10 dígitos que empiezan por 3 (celular) -> anteponer indicativo 57
  if (num.length === 10 && num[0] === "3") num = "57" + num;

  if (num.length < 10) {
    showHint("Ingresa el número de WhatsApp del cliente (ej. 300 000 0000).", false);
    return;
  }

  const msg =
    "¡Hola! Gracias por confiar en Gestiones Eléctricas ⚡\n\n" +
    "Si quedaste satisfecho con el servicio, nos ayudarías muchísimo dejando tu reseña en Google (te toma 30 segundos):\n" +
    REVIEW_LINK;

  window.open("https://wa.me/" + num + "?text=" + encodeURIComponent(msg), "_blank");
  showHint("✓ Se abrió WhatsApp para enviarle la reseña al cliente.", true);
}

// Acciones sincrónicas disparadas desde los botones del Overlay
function executeOverlayDownload() {
  if (!window.lastGeneratedPdfBlob || !window.lastGeneratedPdfFileName) {
    alert("⚠️ No hay un PDF generado en memoria.");
    return;
  }
  downloadBlobFile(window.lastGeneratedPdfBlob, window.lastGeneratedPdfFileName);
}

function executeOverlayWhatsApp() {
  if (!window.lastGeneratedPdfBlob || !window.lastGeneratedPdfFileName) {
    alert("⚠️ No hay un PDF generado en memoria.");
    return;
  }

  const tel = document.getElementById("field-telefono").value.replace(/\D/g, '') || "";
  if (!tel) {
    alert("Por favor, ingrese un número de teléfono de contacto para el cliente en el formulario.");
    closeOverlay();
    return;
  }

  const otNum = window.otBadgeNum.textContent;
  const msgText = `Hola, te compartimos el soporte digital de tu servicio de Gestiones Eléctricas con Folio ${otNum} realizado hoy. ¡Agradecemos calificar nuestro servicio en el link de Google! ⚡`;

  shareOrFallback(window.lastGeneratedPdfBlob, window.lastGeneratedPdfFileName, msgText, () => {
    const msg = encodeURIComponent(msgText);
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
  });
}

function executeOverlayEmail() {
  if (!window.lastGeneratedPdfBlob || !window.lastGeneratedPdfFileName) {
    alert("⚠️ No hay un PDF generado en memoria.");
    return;
  }

  const email = document.getElementById("field-email").value.trim() || "cliente@empresa.com";
  const otNum = window.otBadgeNum.textContent;
  const subjectText = `Acta de Inspección Técnica - Gestiones Eléctricas ${otNum}`;
  const bodyText = `Estimado cliente,\n\nLe adjunto el Acta de Inspección Técnica Digital correspondiente al servicio realizado bajo la Orden de Trabajo ${otNum}.\n\n¡Gracias por confiar en el equipo de Gestiones Eléctricas SAS! ⚡`;

  shareOrFallback(window.lastGeneratedPdfBlob, window.lastGeneratedPdfFileName, bodyText, () => {
    const subject = encodeURIComponent(subjectText);
    const body = encodeURIComponent(bodyText);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  });
}

function closeOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.style.display = "none";
}

// Descarga DIRECTA del PDF (botón "Descargar"): un enlace <a download> con el
// blob. En Android (Chrome/Brave) y en escritorio la descarga inicia de una vez,
// sin abrir la hoja de compartir ni el gestor de archivos. iOS Safari no permite
// descargar blobs, así que allí se abre el PDF en una pestaña para guardarlo.
function downloadBlobFile(blob, fileName) {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.rel = "noopener";
  if (isIOS) {
    a.target = "_blank"; // iOS: abrir para que el usuario lo guarde (no soporta download de blob)
  } else {
    a.download = fileName; // Android + escritorio: descarga directa e inmediata
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 12000);
}

function fallbackDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile || isSafari) {
    const isIOSChrome = navigator.userAgent.match("CriOS");
    if (isIOSChrome) {
      // Convertir a base64 para iOS Chrome
      const reader = new FileReader();
      reader.onloadend = function() {
        window.open(reader.result, '_blank');
      };
      reader.readAsDataURL(blob);
    } else {
      const newWindow = window.open(blobUrl, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
        window.location.href = blobUrl;
      }
    }
  } else {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 15000);
}

// Compartir nativo o fallback a WhatsApp/Email
function shareOrFallback(blob, fileName, text, fallbackFn) {
  const file = new File([blob], fileName, { type: "application/pdf" });
  const shareData = {
    files: [file],
    title: "Acta Técnica Digital",
    text: text
  };

  if (navigator.canShare && navigator.canShare(shareData)) {
    navigator.share(shareData)
      .then(() => console.log("Compartido con éxito via API Share"))
      .catch(err => {
        if (err.name !== "AbortError") {
          console.error("Error al compartir via API Share:", err);
          fallbackFn();
        }
      });
  } else {
    // Si no soporta compartir archivos, descargamos el PDF en el celular
    // y redirigimos a la app correspondiente (WhatsApp o Email)
    alert("ℹ️ Tu dispositivo no permite adjuntar archivos directamente. Se procederá a descargar el acta y luego podrás adjuntarla manualmente en el chat o correo.");
    fallbackDownload(blob, fileName);
    setTimeout(fallbackFn, 1500);
  }
}
