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

  // Cargar imágenes en PDF
  const slots = ["antes", "despues", "detalle", "adicional"];
  slots.forEach(slot => {
    const box = document.getElementById(`pdf-img-${slot}-box`);
    box.innerHTML = "";
    
    if (window.imagesInMemory[slot]) {
      box.innerHTML = `<img src="${window.imagesInMemory[slot]}" class="pdf-photo-img">`;
    } else {
      box.innerHTML = `<div class="pdf-photo-placeholder">Sin Imagen Adjunta</div>`;
    }
  });

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

// --- Generación programática de PDF Blob usando html2pdf ---
function generatePdfBlob(fileName) {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    const textEl = overlay.querySelector("div:nth-child(2)");
    if (textEl) textEl.textContent = "Compilando reporte digital en PDF...";
  }

  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;
  window.scrollTo(0, 0);

  preparePrintableTemplate();

  const originalTemplate = document.getElementById("pdf-printable-template");
  originalTemplate.style.display = "block";
  originalTemplate.style.position = "absolute";
  originalTemplate.style.top = "0";
  originalTemplate.style.left = "0";
  originalTemplate.style.width = "794px";
  originalTemplate.style.zIndex = "1";
  originalTemplate.style.background = "white";

  const opt = {
    margin:       [10, 10, 10, 10],
    filename:     fileName,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      logging: false,
      scrollY: 0,
      scrollX: 0
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  return html2pdf()
    .set(opt)
    .from(originalTemplate)
    .outputPdf('blob')
    .then(blob => {
      originalTemplate.style.display = "none";
      originalTemplate.style.position = "";
      originalTemplate.style.top = "";
      originalTemplate.style.left = "";
      originalTemplate.style.width = "";
      originalTemplate.style.zIndex = "";
      originalTemplate.style.background = "";
      
      window.scrollTo(scrollX, scrollY);
      if (overlay) overlay.style.display = "none";
      return blob;
    })
    .catch(err => {
      console.error("Error al generar PDF:", err);
      originalTemplate.style.display = "none";
      originalTemplate.style.position = "";
      originalTemplate.style.top = "";
      originalTemplate.style.left = "";
      originalTemplate.style.width = "";
      originalTemplate.style.zIndex = "";
      originalTemplate.style.background = "";
      
      window.scrollTo(scrollX, scrollY);
      if (overlay) overlay.style.display = "none";
      throw err;
    });
}

// Descarga adaptada y optimizada para celulares y Safari
function downloadBlobFile(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isMobile || isSafari) {
    const isIOSChrome = navigator.userAgent.match("CriOS");
    if (isIOSChrome) {
      // iOS Chrome: abrir a través de conversión a DataURL para evitar bloqueos
      const reader = new FileReader();
      reader.onloadend = function() {
        window.open(reader.result, '_blank');
      };
      reader.readAsDataURL(blob);
    } else {
      // Android Chrome / iOS Safari: Abrir en pestaña nueva o redireccionar actual
      const newWindow = window.open(blobUrl, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
        window.location.href = blobUrl;
      }
    }
  } else {
    // Computadora de escritorio: descarga directa silenciosa
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Revocar para limpiar memoria
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 15000);
}

// Descarga directa de PDF
function generateProfessionalPDF() {
  if (!validateFormForExport("descargarlo")) return;

  const cliente = document.getElementById("field-cliente").value.trim();
  const otNum = window.otBadgeNum.textContent;
  const safeCliente = cliente.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `Acta_${otNum}_${safeCliente}.pdf`;

  generatePdfBlob(fileName).then(blob => {
    downloadBlobFile(blob, fileName);
  }).catch(err => {
    console.error("Error al descargar PDF:", err);
    alert("❌ Error al descargar el PDF.");
  });
}

// Enviar / Compartir
function shareOrFallback(blob, fileName, text, fallbackFn) {
  const file = new File([blob], fileName, { type: "application/pdf" });
  const shareData = {
    files: [file],
    title: "Acta Técnica Digital",
    text: text
  };

  if (navigator.canShare && navigator.canShare(shareData)) {
    navigator.share(shareData)
      .then(() => console.log("Compartido con éxito"))
      .catch(err => {
        if (err.name !== "AbortError") {
          console.error("Error al compartir:", err);
          fallbackFn();
        }
      });
  } else {
    alert("ℹ️ Tu dispositivo no permite adjuntar archivos directamente desde la web. Se procederá a abrir/descargar el acta y luego podrás adjuntarla manualmente.");
    
    // Descarga/apertura fallback con soporte móvil
    downloadBlobFile(blob, fileName);

    // Abrir app del canal (WhatsApp o correo)
    setTimeout(fallbackFn, 1000);
  }
}

function shareByEmail() {
  if (!validateFormForExport("compartirlo")) return;

  const email = document.getElementById("field-email").value.trim() || "cliente@empresa.com";
  const otNum = window.otBadgeNum.textContent;
  const cliente = document.getElementById("field-cliente").value.trim();
  const safeCliente = cliente.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `Acta_${otNum}_${safeCliente}.pdf`;

  const subjectText = `Acta de Inspección Técnica - Gestiones Eléctricas ${otNum}`;
  const bodyText = `Estimado cliente,\n\nLe adjunto el Acta de Inspección Técnica Digital correspondiente al servicio realizado bajo la Orden de Trabajo ${otNum}.\n\n¡Gracias por confiar en el equipo de Gestiones Eléctricas SAS! ⚡`;

  generatePdfBlob(fileName).then(blob => {
    shareOrFallback(blob, fileName, bodyText, () => {
      const subject = encodeURIComponent(subjectText);
      const body = encodeURIComponent(bodyText);
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    });
  }).catch(err => {
    console.error("Error al compartir por correo:", err);
  });
}

function shareByWhatsApp() {
  if (!validateFormForExport("compartirlo")) return;

  const tel = document.getElementById("field-telefono").value.replace(/\D/g, '') || "";
  if (!tel) {
    alert("Por favor, ingrese un número de teléfono de contacto para el cliente.");
    return;
  }
  const otNum = window.otBadgeNum.textContent;
  const cliente = document.getElementById("field-cliente").value.trim();
  const safeCliente = cliente.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `Acta_${otNum}_${safeCliente}.pdf`;

  const msgText = `Hola, te compartimos el soporte digital de tu servicio de Gestiones Eléctricas con Folio ${otNum} realizado hoy. ¡Agradecemos calificar nuestro servicio en el link de Google! ⚡`;

  generatePdfBlob(fileName).then(blob => {
    shareOrFallback(blob, fileName, msgText, () => {
      const msg = encodeURIComponent(msgText);
      window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
    });
  }).catch(err => {
    console.error("Error al compartir por WhatsApp:", err);
  });
}
