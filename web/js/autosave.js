// --- LocalStorage AutoSave ---
function saveCurrentFormToLocal() {
  const data = {
    servicioTipo: document.getElementById("field-servicio-tipo").value,
    cliente: document.getElementById("field-cliente").value,
    direccion: document.getElementById("field-direccion").value,
    telefono: document.getElementById("field-telefono").value,
    email: document.getElementById("field-email").value,
    tecnico: document.getElementById("field-tecnico").value,
    matricula: document.getElementById("field-matricula").value,
    diagnostico: document.getElementById("field-diagnostico").value,
    tension: document.getElementById("field-tension").value,
    corriente: document.getElementById("field-corriente").value,
    acciones: document.getElementById("field-acciones").value,
    norma: document.getElementById("field-norma").value,
    firmanteNombre: document.getElementById("field-firmante-nombre").value,
    firmanteDocumento: document.getElementById("field-firmante-documento").value,
    operacionFinal: document.querySelector('input[name="operacion-final"]:checked')?.value || "si",
    activoId: (window.getActivoSeleccionado ? window.getActivoSeleccionado().id : ""),
    activoCodigo: (window.getActivoSeleccionado ? window.getActivoSeleccionado().codigo : ""),
    checklist: window.checklistItems.map(item => ({ id: item.id, state: item.state })),
    materials: Array.from(window.materialsTbody.querySelectorAll("tr")).map(tr => ({
      desc: tr.querySelector(".desc-input").value,
      cant: tr.querySelector(".cant-input").value,
      ref: tr.querySelector(".ref-input").value
    }))
  };
  
  localStorage.setItem("ge_form_draft", JSON.stringify(data));
  updateTimelineProgress();
  pushDraftToServer(data); // F2.2: el server es la fuente de verdad; localStorage queda de caché
}

// --- Autosave server-side (F2.2): debounce 2s, fire-and-forget ---
// Si no hay señal o el server no existe (deploy Vercel viejo), falla en silencio:
// el flujo local + PDF sigue intacto. F2.4 formaliza la cola offline.
let _draftTimer = null;
function pushDraftToServer(data) {
  const uuid = localStorage.getItem("ge_current_acta_uuid");
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(() => {
    const payload = buildDraftPayload(data);
    if (!uuid || !navigator.onLine) {
      // F2.4: borrador a la cola (coalescido por acta — el último gana)
      if (window.queueDraft) window.queueDraft(uuid, payload);
      return;
    }
    fetch(`/api/actas/${uuid}/draft`, {
      method: "PUT",
      headers: window.geHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }).then((r) => { if (!r.ok && r.status !== 400 && window.queueDraft) window.queueDraft(uuid, payload); })
      .catch(() => { if (window.queueDraft) window.queueDraft(uuid, payload); });
  }, 2000);
}

function buildDraftPayload(data) {
  return {
        data: {
          servicioTipo: data.servicioTipo, cliente: data.cliente, direccion: data.direccion,
          telefono: data.telefono, email: data.email, tecnico: data.tecnico,
          matricula: data.matricula, diagnostico: data.diagnostico, tension: data.tension,
          corriente: data.corriente, acciones: data.acciones, norma: data.norma,
          firmanteNombre: data.firmanteNombre, firmanteDocumento: data.firmanteDocumento,
          operacionFinal: data.operacionFinal,
          activo_id: data.activoId || "", activo_codigo: data.activoCodigo || "",
          ot: localStorage.getItem("ge_current_ot") || "",
          gps: window.gpsLat != null ? `${window.gpsLat},${window.gpsLng}` : (data.gps || ""),
        },
        checklist: (data.checklist || []).map(c => ({ item_id: c.id, estado: c.state })),
        materiales: (data.materials || []).filter(m => m.desc).map(m => ({
          descripcion: m.desc, cantidad: m.cant, unidad: m.ref,
        })),
  };
}

// F2.6: si el borrador local se perdió (navegador limpiado / otro dispositivo)
// pero el acta existe en el servidor, se restaura desde allá.
async function restoreFromServer() {
  const uuid = localStorage.getItem("ge_current_acta_uuid");
  if (!uuid || localStorage.getItem("ge_form_draft") || !navigator.onLine) return;
  try {
    const r = await fetch(`/api/actas/${uuid}`, { headers: window.geHeaders() });
    if (!r.ok) { window.geHandle401 && window.geHandle401(r); return; }
    const a = await r.json();
    const d = a.data || {};
    const draft = {
      servicioTipo: d.servicioTipo, cliente: d.cliente, direccion: d.direccion,
      telefono: d.telefono, email: d.email, tecnico: d.tecnico, matricula: d.matricula,
      diagnostico: d.diagnostico, tension: d.tension, corriente: d.corriente,
      acciones: d.acciones, norma: d.norma, firmanteNombre: d.firmanteNombre,
      firmanteDocumento: d.firmanteDocumento, operacionFinal: d.operacionFinal,
      activoId: d.activo_id || "", activoCodigo: d.activo_codigo || "",
      checklist: (a.checklist || []).map(c => ({ id: c.item_id, state: c.estado })),
      materials: (a.materiales || []).map(m => ({ desc: m.descripcion, cant: m.cantidad, ref: m.unidad })),
    };
    localStorage.setItem("ge_form_draft", JSON.stringify(draft));
    if (a.ot) { localStorage.setItem("ge_current_ot", a.ot); if (typeof paintOT === "function") paintOT(a.ot); }
    loadLocalStorageData();
    if (typeof window.initDiagSlots === "function") window.initDiagSlots(a.fotos); // F3.2: restaurar cards de IA
  } catch { /* sin señal: se queda el flujo local */ }
}

// F3.2: aunque el borrador local exista, las cards de diagnóstico se restauran
// del server (las fotos/inspecciones viven allá).
async function refreshDiagFromServer() {
  const uuid = localStorage.getItem("ge_current_acta_uuid");
  if (!uuid || !navigator.onLine) return;
  try {
    const r = await fetch(`/api/actas/${uuid}`, { headers: window.geHeaders() });
    if (!r.ok) return;
    const a = await r.json();
    if (typeof window.initDiagSlots === "function") window.initDiagSlots(a.fotos);
  } catch { /* sin señal */ }
}

function loadLocalStorageData() {
  const draftStr = localStorage.getItem("ge_form_draft");
  if (draftStr) {
    try {
      const data = JSON.parse(draftStr);
      
      document.getElementById("field-servicio-tipo").value = data.servicioTipo || "Diagnóstico";
      document.getElementById("field-cliente").value = data.cliente || "";
      document.getElementById("field-direccion").value = data.direccion || "";
      document.getElementById("field-telefono").value = data.telefono || "";
      document.getElementById("field-email").value = data.email || "";
      document.getElementById("field-tecnico").value = data.tecnico || "";
      document.getElementById("field-matricula").value = data.matricula || "";
      document.getElementById("field-diagnostico").value = data.diagnostico || "";
      document.getElementById("field-tension").value = data.tension || "";
      document.getElementById("field-corriente").value = data.corriente || "";
      document.getElementById("field-acciones").value = data.acciones || "";
      document.getElementById("field-norma").value = data.norma || "RETIE 2013 / 2022";
      document.getElementById("field-firmante-nombre").value = data.firmanteNombre || "";
      document.getElementById("field-firmante-documento").value = data.firmanteDocumento || "";
      if (data.activoId && window.setActivoFromDraft) window.setActivoFromDraft(data.activoId, data.activoCodigo);
      
      // Compliance radio
      const opVal = data.operacionFinal || "si";
      const radio = document.querySelector(`input[name="operacion-final"][value="${opVal}"]`);
      if (radio) radio.checked = true;
      
      // Checklist
      if (data.checklist) {
        data.checklist.forEach(savedItem => {
          const localItem = window.checklistItems.find(i => i.id === savedItem.id);
          if (localItem) {
            localItem.state = savedItem.state;
            
            // Actualizar interfaz visual
            const checkDiv = document.querySelector(`.check-item[data-index="${window.checklistItems.indexOf(localItem)}"]`);
            if (checkDiv) {
              const statusSpan = checkDiv.querySelector(".check-status");
              checkDiv.classList.remove("ok", "fail");
              if (savedItem.state === "ok") {
                checkDiv.classList.add("ok");
                statusSpan.textContent = "OK";
              } else if (savedItem.state === "fail") {
                checkDiv.classList.add("fail");
                statusSpan.textContent = "FALLA";
              } else {
                statusSpan.textContent = "";
              }
            }
          }
        });
      }

      // Materials Table
      if (data.materials && data.materials.length > 0) {
        window.materialsTbody.innerHTML = "";
        data.materials.forEach(m => {
          addMaterialRow(m.desc, m.cant, m.ref);
        });
      } else {
        // Añadir por lo menos dos filas en blanco iniciales
        addMaterialRow();
        addMaterialRow();
      }

    } catch (e) {
      console.error("Error cargando borrador local:", e);
    }
  } else {
    // Tabla con dos filas por defecto si está vacío
    addMaterialRow();
    addMaterialRow();
  }

  // Cargar firma si fue confirmada
  const savedSign = localStorage.getItem("ge_signature");
  if (savedSign) {
    window.signatureConfirmed = true;
    window.signatureDataURL = savedSign;
    
    // Dibujarla en canvas
    const img = new Image();
    img.src = savedSign;
    img.onload = () => {
      window.ctx.drawImage(img, 0, 0);
    };
    
    const statusTxt = document.getElementById("signature-status-txt");
    statusTxt.textContent = "✅ Confirmado (Borrador)";
    statusTxt.classList.add("confirmed");
  }
}

function resetForm() {
  if (confirm("¿Está seguro de que desea vaciar el acta técnica? Perderá todos los datos de esta visita.")) {
    localStorage.removeItem("ge_form_draft");
    localStorage.removeItem("ge_signature");
    localStorage.removeItem("ge_current_ot");
    localStorage.removeItem("ge_current_acta_uuid"); // F2.1: el server asigna una nueva
    localStorage.removeItem("ge_ot_offline");
    
    // Limpiar fotos en memoria
    removePhoto("antes");
    removePhoto("despues");
    removePhoto("detalle");
    removePhoto("adicional");
    
    // Resetear inputs text y checklist
    document.querySelectorAll(".input").forEach(i => {
      if (!i.classList.contains("readonly")) i.value = "";
    });
    document.querySelectorAll(".textarea").forEach(t => t.value = "");
    
    const activoSel = document.getElementById("field-activo");
    if (activoSel) { activoSel.value = ""; document.getElementById("activo-nuevo-row").style.display = "none"; }

    window.checklistItems.forEach(item => item.state = "");
    document.querySelectorAll(".check-item").forEach(el => {
      el.classList.remove("ok", "fail");
      el.querySelector(".check-status").textContent = "";
    });
    
    window.materialsTbody.innerHTML = "";
    addMaterialRow();
    addMaterialRow();
    
    clearSignature();
    initOTNumber();
    initGPSData();
    updateTimelineProgress();
  }
}
