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

    let srcY = 0;
    let page = 0;

    while (srcY < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - srcY);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width  = canvas.width;
      pageCanvas.height = sliceH;
      pageCanvas.getContext("2d").drawImage(
        canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH
      );

      if (page > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.95), "JPEG",
        0, 0, pageW, sliceH / pxPerMm);

      srcY += pageHpx;
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

// --- Guardado en Base de Datos Global ---
function saveFormDataToBackend() {
  try {
    const payload = {
      ot: window.otBadgeNum ? window.otBadgeNum.textContent : "",
      cliente: document.getElementById("field-cliente")?.value || "",
      direccion: document.getElementById("field-direccion")?.value || "",
      tecnico: document.getElementById("field-tecnico")?.value || "",
      tension: document.getElementById("field-tension")?.value || "",
      corriente: document.getElementById("field-corriente")?.value || "",
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

  const cliente = document.getElementById("field-cliente").value.trim();
  const otNum = window.otBadgeNum.textContent;
  const safeCliente = cliente.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `Acta_${otNum}_${safeCliente}.pdf`;

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

// Descarga adaptada y optimizada para PC y Celulares
function downloadBlobFile(blob, fileName) {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    // En móviles, el compartir de archivos es la forma oficial y más robusta de "guardar"
    // evitando bloqueos de descarga de blob o aperturas de páginas en blanco en Safari / Chrome
    const file = new File([blob], fileName, { type: "application/pdf" });
    const shareData = {
      files: [file],
      title: fileName,
      text: "Acta Técnica Digital"
    };

    if (navigator.canShare && navigator.canShare(shareData)) {
      navigator.share(shareData)
        .then(() => console.log("Guardado mediante API Share móvil con éxito"))
        .catch(err => {
          if (err.name !== "AbortError") {
            console.error("Error al descargar con API Share:", err);
            fallbackDownload(blob, fileName);
          }
        });
      return;
    }
  }

  // Descarga tradicional en PC o si el celular no soporta API Share con archivos
  fallbackDownload(blob, fileName);
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
