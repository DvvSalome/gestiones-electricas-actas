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
    document.getElementById('assetCombo').classList.remove('open');
    document.getElementById('assetCombo').style.display = 'none';
    
    // Si era la caja nueva, mostrar la ficha
    window.activoActual = { id, codigo, nombre };
    
    // UI del activo Picked
    document.getElementById('assetPickedWrap').innerHTML = `
      <div class="asset-picked">
        <div class="ap-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M8 14h2"/>
          </svg>
        </div>
        <div>
          <div class="ap-code">${codigo}</div>
          <div class="ap-desc">${nombre} ${semaforo}</div>
        </div>
        <div class="ap-btns">
          <button class="ap-change" onclick="window.changeAsset()">Cambiar activo</button>
        </div>
      </div>
    `;
    
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
  };

  window.changeAsset = function() {
    document.getElementById('assetPickedWrap').innerHTML = ''; 
    document.getElementById('assetCombo').style.display = 'block';
    window.activoActual = null;
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
  };

  // Asignar creación de activo desde el mini panel
  window.UI.createAsset = async function() {
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
        const prefijo = window.UI.prefixFrom(custom);
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
    
    // Crear el activo
    let finalPrefix = (t === 'otro') ? window.UI.prefixFrom(custom) : tipo;
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
      
      window.UI.closeCreateAssetMini();
      window.pickAsset(activo.id, activo.codigo, 'Nuevo activo', '');
      window.loadActivos();
      if(window.app && app.toast) app.toast('Activo creado y seleccionado ✓');
    } catch {
      if(window.app && app.toast) app.toast("No se pudo crear el activo");
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.loadTiposActivo();
  });
})();
