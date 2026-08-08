// F6.7: identidad de sede + historial de servicios anteriores, buscable desde
// el acta en campo — ver comentario largo en apps/actas/src/routes/historial.js.
// Dos piezas:
//  1. Autocompletado: al escribir en "Nombre del Cliente" se sugieren sedes
//     YA existentes (evita duplicar la misma sede por may/min o tildes).
//  2. Historial: si la sede quedó identificada (elegida acá, o porque un
//     diagnóstico anterior ya la vinculó), se listan sus servicios previos,
//     con la opción de marcar el nuevo como continuación de uno de ellos.
(function () {
  let sugerenciaTimer = null;
  let sedeActualId = localStorage.getItem("ge_sede_id") || null;

  function inputEl() { return document.getElementById("field-cliente"); }
  function sugerenciasEl() { return document.getElementById("sede-sugerencias"); }
  function historialEl() { return document.getElementById("historial-cliente"); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ── autocompletado ──
  async function buscarSedes(q) {
    try {
      const r = await fetch(`/api/sedes/buscar?q=${encodeURIComponent(q)}`, { headers: window.geHeaders() });
      if (!r.ok) return [];
      const d = await r.json();
      return d.sedes || [];
    } catch { return []; } // sin señal: el técnico sigue escribiendo libre, sin sugerencias
  }

  function renderSugerencias(sedes) {
    const box = sugerenciasEl();
    if (!box) return;
    if (!sedes.length) { box.style.display = "none"; box.innerHTML = ""; return; }
    box.innerHTML = sedes.map((s, i) => `
      <div class="sede-sugerencia" data-idx="${i}">
        <b>${esc(s.name)}</b>
        <span>${esc(s.city || "")}${s.city ? " · " : ""}${s.inspecciones || 0} servicio${s.inspecciones === 1 ? "" : "s"} anterior${s.inspecciones === 1 ? "" : "es"}</span>
      </div>`).join("");
    box.querySelectorAll(".sede-sugerencia").forEach((el, i) => {
      // mousedown (no click): dispara ANTES del blur del input, si no el blur
      // de activos.js cierra/oculta esto antes de que el click llegue a registrarse.
      el.addEventListener("mousedown", (e) => { e.preventDefault(); seleccionarSede(sedes[i]); });
    });
    box.style.display = "block";
  }

  function ocultarSugerencias() {
    const box = sugerenciasEl();
    if (box) { box.style.display = "none"; box.innerHTML = ""; }
  }

  function seleccionarSede(sede) {
    const input = inputEl();
    if (input) input.value = sede.name;
    ocultarSugerencias();
    sedeActualId = sede.id;
    localStorage.setItem("ge_sede_id", sede.id);
    vincularSedeActual(sede.id);
    cargarHistorial(sede.id);
    if (typeof window.loadActivos === "function") window.loadActivos(); // refresca el desplegable de activos para esta sede
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
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
    ocultarSugerencias();
  };

  document.addEventListener("DOMContentLoaded", () => {
    const input = inputEl();
    if (!input) return;

    input.addEventListener("input", () => {
      // si el técnico sigue escribiendo después de haber elegido una sede,
      // asume que ya no es esa — se re-vincula solo si vuelve a elegir otra.
      if (sedeActualId) { sedeActualId = null; localStorage.removeItem("ge_sede_id"); window.ocultarHistorialCliente(); }
      clearTimeout(sugerenciaTimer);
      const q = input.value.trim();
      if (q.length < 2) { ocultarSugerencias(); return; }
      sugerenciaTimer = setTimeout(async () => {
        renderSugerencias(await buscarSedes(q));
      }, 300);
    });

    // blur con demora: si no, el mousedown de la sugerencia nunca alcanza a
    // ejecutarse porque el blur ya la escondió (por eso arriba se usa
    // mousedown + preventDefault en vez de click).
    input.addEventListener("blur", () => setTimeout(ocultarSugerencias, 150));

    // sede ya vinculada de una sesión anterior en este mismo dispositivo
    // (ver restoreFromServer en autosave.js) — muestra el historial directo.
    if (sedeActualId) cargarHistorial(sedeActualId);
  });
})();
