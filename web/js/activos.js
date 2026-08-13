// F4.2: selector de activo (hoja de vida) del bloque 01.
// Adaptado a los nuevos combobox visuales.

(function () {
  const SEMAFORO_ICON = { rojo: "🔴", ambar: "🟡", verde: "🟢" };

  window.getActivoSeleccionado = function () {
    if (!window.activoActual) return { id: "", codigo: "" };
    return { id: window.activoActual.id, codigo: window.activoActual.codigo };
  };

  window.marcarActivoConformeSiAplica = function () {
    const operacionFinal = document.querySelector('input[name="operacion-final"]:checked')?.value || "si";
    if (operacionFinal !== "si") return;
    const activo = window.getActivoSeleccionado();
    if (!activo.id) return;
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    if (!uuid || !navigator.onLine) return;
    fetch(`/api/actas/${uuid}/activo/conforme`, {
      method: "POST",
      headers: window.geHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ activoId: activo.id }),
    }).catch((e) => console.error("[activo-conforme]", e));
  };

  function pintarTipos(tipos, respaldo) {
    const s = document.getElementById("newType");
    if (!s) return;
    // Catálogo completo (clave+etiqueta+prefijo) para que code()/createAsset()
    // resuelvan el PREFIJO real (TAB, ACO...) — el <option value> es la clave
    // ("tablero"), no el prefijo, y usarla tal cual como prefijo del código
    // generaba activos "tablero-9999" en vez de "TAB-9999".
    window.D = window.D || {};
    window.D.tiposCatalog = tipos;
    const prev = s.value;
    s.innerHTML = "";
    for (const t of tipos) {
      const o = document.createElement("option");
      o.value = t.clave;
      o.textContent = t.etiqueta + (t.prefijo ? ` (${t.prefijo}-)` : "");
      s.appendChild(o);
    }
    const nuevo = document.createElement("option");
    nuevo.value = "otro";
    nuevo.textContent = "＋ Crear tipo nuevo…";
    s.appendChild(nuevo);
    if (prev && prev !== "otro" && s.querySelector(`option[value="${prev}"]`)) s.value = prev;
  }

  window.loadTiposActivo = async function () {
    if (!navigator.onLine) return;
    try {
      const r = await fetch("/api/activos/tipos", { headers: window.geHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      pintarTipos(d.tipos || [], Boolean(d.respaldo));
    } catch { /* offline */ }
  };

  window.loadActivos = async function () {
    const cliente = window.clienteActual ? window.clienteActual.nombre : null;
    const list = document.getElementById('assetList');
    
    if (!cliente || !navigator.onLine) {
      list.innerHTML = '<div style="padding:13px;font-size:12px;color:var(--text-faint);text-align:center">Sin activos aún · crea el primero</div>';
      return;
    }
    
    try {
      const r = await fetch(`/api/activos?cliente=${encodeURIComponent(cliente)}`, { headers: window.geHeaders() });
      if (!r.ok) return;
      const { activos } = await r.json();
      
      if (!activos || activos.length === 0) {
        list.innerHTML = '<div style="padding:13px;font-size:12px;color:var(--text-faint);text-align:center">Sin activos aún · crea el primero</div>';
      } else {
        list.innerHTML = activos.map((a, i) => `
          <div class="combo-opt" data-idx="${i}" onclick="window.pickAsset('${a.id}', '${a.codigo}', '${a.nombre || ''}', '${SEMAFORO_ICON[a.semaforo] || ''}')">
            <div class="co-av">${a.codigo.slice(0,3)}</div>
            <div class="co-b">
              <div class="co-name">${a.codigo}</div>
              <div class="co-meta">${a.nombre || 'Activo'} ${SEMAFORO_ICON[a.semaforo] || ''}</div>
            </div>
          </div>
        `).join('');
      }
    } catch { 
      list.innerHTML = '<div style="padding:13px;font-size:12px;color:var(--text-faint);text-align:center">Error cargando activos</div>';
    }
  };


  window.pickAsset = function(id, codigo, nombre, semaforo) {
    window.activoActual = { id, codigo, nombre };
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
    
    // Call the reference UI function to show the picked asset and floating buttons
    if (window.D && window.D.pickAsset) {
        window.D.pickAsset(id, codigo, nombre || 'Activo', semaforo || '');
    }
  };


  window.changeAsset = function() {
    document.getElementById('assetPickedWrap').innerHTML = ''; 
    document.getElementById('assetCombo').style.display = 'block';
    window.activoActual = null;
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
  };

  // Asignar creación de activo desde el mini panel
  window.D = window.D || {};
  window.D.createAsset = async function() {
    const cliente = window.clienteActual ? window.clienteActual.nombre : null;
    const num = document.getElementById("newNum").value.trim();
    const t = document.getElementById("newType").value;
    
    let tipo = t;
    let custom = "";
    
    if (!cliente) { if(window.app && app.toast) app.toast("Selecciona primero el cliente"); return; }
    if (!num) { if(window.app && app.toast) app.toast("Escribe el número del activo"); return; }
    
    if (t === 'otro') {
      custom = document.getElementById('newTypeCustom').value.trim();
      if (!custom) { if(window.app && app.toast) app.toast('Escribe el nombre del nuevo tipo'); return; }
    }
    
    if (!navigator.onLine) { if(window.app && app.toast) app.toast("Sin conexión: intente luego."); return; }
    
    // Si es "otro", primero creamos el tipo
    if (t === 'otro') {
      try {
        const prefijo = window.D.prefixFrom(custom);
        const r1 = await fetch("/api/activos/tipos", {
          method: "POST",
          headers: window.geHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ etiqueta: custom, prefijo: prefijo }),
        });
        if (r1.ok) {
          const d1 = await r1.json();
          tipo = d1.tipo ? d1.tipo.clave : tipo;
        }
      } catch (e) {
        console.warn("Fallo creando tipo", e);
      }
    }
    
    // Crear el activo. El prefijo del código es window.D.tiposCatalog[].prefijo
    // (TAB, ACO...), NO la clave del tipo ("tablero") — usar la clave directo
    // generaba códigos como "tablero-9999" en vez de "TAB-9999".
    let finalPrefix;
    if (t === 'otro') {
      finalPrefix = window.D.prefixFrom(custom);
    } else {
      const catalogado = (window.D.tiposCatalog || []).find((x) => x.clave === t);
      finalPrefix = (catalogado && catalogado.prefijo) ? catalogado.prefijo : t.toUpperCase();
    }
    const finalCode = `${finalPrefix}-${num}`;

    try {
      const r = await fetch("/api/activos", {
        method: "POST",
        headers: window.geHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ cliente, codigo: finalCode, tipo }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        if(window.app && app.toast) app.toast(d?.error || "Error creando activo");
        return;
      }
      const { activo } = await r.json();

      window.activoActual = { id: activo.id, codigo: activo.codigo, nombre: activo.nombre };
      if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
      if (window.D && window.D.closeCreate) window.D.closeCreate();
      window.loadActivos();
      // Abre la ficha de inmediato — igual que la referencia: recién creado el
      // activo, el técnico está frente al equipo y es cuando tiene sentido
      // capturar identidad de placa, SPT y rendimiento, no después.
      const typeName = custom || tipo;
      if (window.D && window.D.openFicha) window.D.openFicha(activo.id, activo.codigo, typeName, true);
      if(window.app && app.toast) app.toast('Activo creado ✓ — completa su ficha');
    } catch {
      if(window.app && app.toast) app.toast("No se pudo crear el activo");
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.loadTiposActivo();
  });
})();
