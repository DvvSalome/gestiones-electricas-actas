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
    checklist: window.checklistItems.map(item => ({ id: item.id, state: item.state })),
    materials: Array.from(window.materialsTbody.querySelectorAll("tr")).map(tr => ({
      desc: tr.querySelector(".desc-input").value,
      cant: tr.querySelector(".cant-input").value,
      ref: tr.querySelector(".ref-input").value
    }))
  };
  
  localStorage.setItem("ge_form_draft", JSON.stringify(data));
  updateTimelineProgress();
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
