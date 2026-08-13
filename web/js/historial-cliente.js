// F6.7: identidad de sede + historial de servicios anteriores, buscable desde
// el acta en campo. Modificado para usar los nuevos componentes combobox.
(function () {
  let sugerenciaTimer = null;
  let sedeActualId = localStorage.getItem("ge_sede_id") || null;

  function inputEl() { return document.querySelector("#clientCombo .combo-search input"); }
  function sugerenciasEl() { return document.getElementById("clientList"); }
  function historialEl() { return document.getElementById("historial-cliente"); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ── autocompletado ──
  window.buscarSedes = async function(q) {
    try {
      const r = await fetch(`/api/sedes/buscar?q=${encodeURIComponent(q)}`, { headers: window.geHeaders() });
      if (!r.ok) return [];
      const d = await r.json();
      return d.sedes || [];
    } catch { return []; } 
  };

  window.renderSugerencias = function(sedes) {
    const box = sugerenciasEl();
    if (!box) return;
    if (!sedes || !sedes.length) { 
      box.innerHTML = '<div style="padding:13px;font-size:12px;color:var(--text-faint);text-align:center">Sin resultados</div>'; 
      return; 
    }
    box.innerHTML = sedes.map((s, i) => `
      <div class="combo-opt" data-idx="${i}">
        <div class="co-av">${esc(s.name.slice(0,2).toUpperCase())}</div>
        <div class="co-b">
          <div class="co-name">${esc(s.name)}</div>
          <div class="co-meta">${esc(s.city || "")}</div>
        </div>
        <span class="co-count">${s.inspecciones || 0} visitas</span>
      </div>`).join("");
      
    box.querySelectorAll(".combo-opt").forEach((el, i) => {
      el.addEventListener("mousedown", (e) => { e.preventDefault(); seleccionarSede(sedes[i]); });
    });
  }

  function ocultarSugerencias() {
    const box = sugerenciasEl();
    // if (box) { box.innerHTML = ""; } // No hide completely so the user sees "no results"
  }

  // Expuesta en window para que mis-clientes.js (galería "Mis clientes") pueda
  // reusar exactamente la misma lógica de selección — combo, vínculo con el
  // acta, historial, activos — en vez de duplicarla.
  window.seleccionarSede = seleccionarSede;
  function seleccionarSede(sede) {
    // Fill the combo input visual representation
    const comboInput = document.querySelector('#clientCombo .combo-input');
    comboInput.classList.add('filled');
    const main = document.getElementById('clientMain');
    main.classList.remove('ph'); 
    main.textContent = sede.name;
    const sub = document.getElementById('clientSub');
    sub.style.display = 'block'; 
    sub.textContent = sede.city || '';
    
    // Set the hidden field if needed, or global var
    window.clienteActual = { id: sede.id, nombre: sede.name, ciudad: sede.city };
    
    // Cerrar el combo
    document.getElementById('clientCombo').classList.remove('open');
    
    sedeActualId = sede.id;
    localStorage.setItem("ge_sede_id", sede.id);
    vincularSedeActual(sede.id);
    cargarHistorial(sede.id);
    
    if (typeof window.loadActivos === "function") window.loadActivos();
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
    
    // Unlock asset combo
    document.getElementById('assetMain').textContent = 'Selecciona o crea un activo…';
  }

  async function vincularSedeActual(siteId, relatedActaUuid) {
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    if (!uuid || !navigator.onLine) return;
    try {
      await fetch(`/api/actas/${uuid}/sede`, {
        method: "PATCH",
        headers: window.geHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ siteId, ...(relatedActaUuid ? { relatedActaUuid } : {}) }),
      });
    } catch (e) { console.error("[historial-cliente] vincular", e); }
  }

  // ── historial de servicios de la sede ──
  async function cargarHistorial(siteId) {
    const box = historialEl();
    if (!box || !siteId) return;
    try {
      const r = await fetch(`/api/sedes/${encodeURIComponent(siteId)}/servicios-previos`, { headers: window.geHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      renderHistorial(d.servicios || []);
    } catch (e) { console.error("[historial-cliente] cargar", e); }
  }

  function renderHistorial(servicios) {
    const box = historialEl();
    if (!box) return;
    const uuidActual = localStorage.getItem("ge_current_acta_uuid");
    const previos = servicios.filter((s) => s.uuid !== uuidActual);
    if (!previos.length) { box.style.display = "none"; box.innerHTML = ""; return; }

    box.innerHTML = `
      <div class="hc-tt">📋 Servicios anteriores en esta sede (${previos.length})</div>
      ${previos.map((s) => {
        const fecha = s.fecha ? new Date(s.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";
        const pill = s.conforme
          ? `<span class="hc-pill ok">Conforme</span>`
          : `<span class="hc-pill warn">${esc(s.estado || "en curso")}</span>`;
        const vinculado = window.sedeRelacionActual === s.uuid;
        return `
        <div class="hc-item">
          <div class="hc-item-info">
            <b>${esc(s.ot)} · ${esc(s.tipoServicio || "Servicio")}</b>
            <span>${fecha}${s.tecnico ? " · " + esc(s.tecnico) : ""}</span>
          </div>
          ${pill}
          <button type="button" class="hc-link-btn ${vinculado ? "activo" : ""}" data-uuid="${esc(s.uuid)}">
            ${vinculado ? "✓ Vinculado" : "Continuar este"}
          </button>
        </div>`;
      }).join("")}
    `;
    box.querySelectorAll(".hc-link-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const yaVinculado = window.sedeRelacionActual === btn.dataset.uuid;
        window.sedeRelacionActual = yaVinculado ? null : btn.dataset.uuid;
        vincularSedeActual(sedeActualId, window.sedeRelacionActual);
        renderHistorial(servicios);
      });
    });
    box.style.display = "block";
  }

  window.ocultarHistorialCliente = function () {
    sedeActualId = null;
    window.sedeRelacionActual = null;
    const box = historialEl();
    if (box) { box.style.display = "none"; box.innerHTML = ""; }
    
    // Clear visual combo
    const comboInput = document.querySelector('#clientCombo .combo-input');
    if(comboInput) comboInput.classList.remove('filled');
    const main = document.getElementById('clientMain');
    if(main) { main.classList.add('ph'); main.textContent = "Buscar o seleccionar cliente…"; }
    const sub = document.getElementById('clientSub');
    if(sub) { sub.style.display = 'none'; }
    window.clienteActual = null;
  };

  // Lógica global para guardar cliente nuevo creado desde el modal — persiste
  // de verdad en el motor (POST /api/sedes → sites, con su ficha de
  // infraestructura eléctrica). Antes esto solo guardaba en localStorage y
  // generaba un id falso ('c'+Date.now()) que el motor rechazaba al vincular
  // la sede al acta (siteId inválido) — el cliente nunca quedaba creado.
  window.D = window.D || {};
  window.D.saveClient = async function() {
    const nombre = document.getElementById('ncNombre').value.trim();
    if (!nombre) { if (window.app && app.toast) app.toast('Escribe el nombre del cliente'); return; }

    const nit = document.getElementById('ncNit') ? document.getElementById('ncNit').value.trim() : '';
    const contacto = document.getElementById('ncContacto') ? document.getElementById('ncContacto').value.trim() : '';
    const tel = document.getElementById('ncTel') ? document.getElementById('ncTel').value.trim() : '';
    const email = document.getElementById('ncEmail') ? document.getElementById('ncEmail').value.trim() : '';

    const direccion = document.getElementById('ncDireccion').value.trim();
    const tipo = document.getElementById('ncTipoCliente').value;

    const readTog = (id) => {
      const g = document.getElementById(id);
      if (!g) return 'no';
      const btns = g.querySelectorAll('button');
      if (btns && btns[0].classList.contains('sel-si')) return 'si';
      return 'no';
    };

    // Infraestructura eléctrica — se guarda UNA vez con el cliente y
    // contextualiza el diagnóstico de todos sus activos futuros.
    const infra = {
      circuito: document.getElementById('ncCircuito').value,
      tieneTrafo: readTog('ncTrafoToggle'),
      trafoCap: document.getElementById('ncTrafoCap').value,
      trafoUbic: document.getElementById('ncTrafoUbic').value,
      trafoTipo: document.getElementById('ncTrafoTipo').value,
      totalizador: document.getElementById('ncTotalizador').value,
      calibreAcometida: document.getElementById('ncCalibreAcometida').value,
      operadorRed: document.getElementById('ncOperador').value,
      comercializador: document.getElementById('ncComercializador').value,
      tarifaComercializador: document.getElementById('ncTarifa').value,
      tieneSpt: readTog('ncSptToggle'),
      tieneSolar: readTog('ncSolarToggle'),
      solarCap: document.getElementById('ncSolarCap').value,
      solarTipo: document.getElementById('ncSolarTipo').value,
      v_mono: document.getElementById('ncV').value,
      i_mono: document.getElementById('ncI').value,
      v_l1n: document.getElementById('ncV_L1N').value,
      v_l2n: document.getElementById('ncV_L2N').value,
      v_l1l2: document.getElementById('ncV_L1L2').value,
      i_a: document.getElementById('ncI_A').value,
      i_b: document.getElementById('ncI_B').value,
      i_n: document.getElementById('ncI_N').value,
      v_l1l2t: document.getElementById('ncV_L1L2t').value,
      v_l2l3t: document.getElementById('ncV_L2L3t').value,
      v_l3l1t: document.getElementById('ncV_L3L1t').value,
      v_l1nt: document.getElementById('ncV_L1Nt').value,
      v_l2nt: document.getElementById('ncV_L2Nt').value,
      v_l3nt: document.getElementById('ncV_L3Nt').value,
      i_at: document.getElementById('ncI_At').value,
      i_bt: document.getElementById('ncI_Bt').value,
      i_ct: document.getElementById('ncI_Ct').value,
      i_nt: document.getElementById('ncI_Nt').value,
    };

    try {
      const r = await fetch('/api/sedes', {
        method: 'POST',
        headers: window.geHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          nombre, direccion, tipoCliente: tipo,
          nit, contacto, telefono: tel, email,
          infraestructura: infra,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = d?.error || 'No se pudo crear el cliente';
        if (window.app && app.toast) app.toast(msg); else alert(msg);
        return;
      }
      const sede = d.sede; // { id: uuid REAL, name, city, address, ... }

      // Cliente recién creado -> el motor ya le generó su cuenta de acceso al
      // portal (usuario+contraseña). Se guarda en el MISMO canal que usa
      // diagnostico-ui.js para que pdf-generator.js la imprima en el acta
      // final sin necesitar ninguna lógica nueva ahí.
      if (d.portalAccess && d.portalAccess.username && d.portalAccess.password) {
        window.portalAccess = d.portalAccess;
        localStorage.setItem('ge_portal_access', JSON.stringify(d.portalAccess));
      }

      if (window.D.closeClientCreate) window.D.closeClientCreate();
      else { document.getElementById('overlayClient').classList.remove('open'); document.getElementById('floatingClient').classList.remove('open'); }

      seleccionarSede(sede);

      if (document.getElementById('field-direccion')) {
        document.getElementById('field-direccion').value = direccion;
      }
      window.D.client = sede;
      if (document.getElementById('assetCombo')) document.getElementById('assetCombo').style.display = 'block';

      if (window.app && app.toast) app.toast('Cliente "' + nombre + '" creado ✓');
      else if (window.D.toast) window.D.toast('Cliente creado. Ahora selecciona o crea un activo.');
    } catch (e) {
      console.error('[saveClient]', e);
      const msg = 'Sin conexión: no se pudo crear el cliente';
      if (window.app && app.toast) app.toast(msg); else alert(msg);
    }
  };


  document.addEventListener("DOMContentLoaded", () => {
    const input = inputEl();
    if (!input) return;

    input.addEventListener("input", () => {
      if (sedeActualId) { 
          // Si el técnico escribe de nuevo, resetea el cliente actual
          window.ocultarHistorialCliente(); 
      }
      clearTimeout(sugerenciaTimer);
      const q = input.value.trim();
      if (q.length < 2) { ocultarSugerencias(); return; }
      sugerenciaTimer = setTimeout(async () => {
        window.renderSugerencias(await buscarSedes(q));
      }, 300);
    });

    input.addEventListener("blur", () => setTimeout(ocultarSugerencias, 150));
    if (sedeActualId) cargarHistorial(sedeActualId);
  });
})();
