// F4.2: selector de activo (hoja de vida) del bloque 01.
// Los activos viven en el motor; este JS solo habla con /api/activos (proxy).
// Offline: la lista no carga pero la selección guardada se conserva como
// opción manual — el acta nunca se bloquea por falta de señal.
(function () {
  const sel = () => document.getElementById("field-activo");

  function baseOptions() {
    return '<option value="">— Sin activo específico —</option><option value="__nuevo">＋ Crear activo nuevo…</option>';
  }

  // asegura que la selección guardada exista como opción (offline / lista aún sin cargar)
  function ensureOption(id, codigo) {
    const s = sel();
    if (!id || s.querySelector(`option[value="${id}"]`)) return;
    const o = document.createElement("option");
    o.value = id;
    o.textContent = codigo || "Activo";
    s.insertBefore(o, s.querySelector('option[value="__nuevo"]'));
  }

  window.setActivoFromDraft = function (id, codigo) {
    ensureOption(id, codigo);
    sel().value = id || "";
  };

  window.getActivoSeleccionado = function () {
    const s = sel();
    const v = s.value;
    if (!v || v === "__nuevo") return { id: "", codigo: "" };
    return { id: v, codigo: s.options[s.selectedIndex]?.textContent?.split(" · ")[0] || "" };
  };

  const SEMAFORO_ICON = { rojo: "🔴", ambar: "🟡", verde: "🟢" };

  // ---- Tipos de activo: vienen del motor, no están escritos aquí ----
  //
  // Antes eran cinco fijos en el HTML. En campo aparecen equipos que nadie
  // previó (una planta eléctrica, un banco de condensadores) y el técnico se
  // quedaba sin poder registrarlos: tenía que llamar a alguien para que tocara
  // el programa. Ahora los crea él y quedan para todo el equipo.
  const selTipo = () => document.getElementById("activo-nuevo-tipo");

  function pintarTipos(tipos, respaldo) {
    const s = selTipo();
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
    nuevo.value = "__nuevo_tipo";
    nuevo.textContent = "＋ Crear tipo nuevo…";
    s.appendChild(nuevo);
    if (prev && prev !== "__nuevo_tipo" && s.querySelector(`option[value="${prev}"]`)) s.value = prev;

    const aviso = document.getElementById("tipos-respaldo-aviso");
    if (aviso) aviso.style.display = respaldo ? "" : "none";
  }

  window.loadTiposActivo = async function () {
    if (!navigator.onLine) {
      const aviso = document.getElementById("tipos-respaldo-aviso");
      if (aviso) aviso.style.display = "";
      return;
    }
    try {
      const r = await fetch("/api/activos/tipos", { headers: window.geHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      pintarTipos(d.tipos || [], Boolean(d.respaldo));
    } catch { /* sin señal: se queda el respaldo del HTML */ }
  };

  /** Propone el prefijo mientras el técnico escribe, para que lo pueda corregir. */
  function sugerirPrefijo(etiqueta) {
    const limpio = String(etiqueta || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z\s]/g, " ").trim();
    if (!limpio) return "";
    const palabras = limpio.split(/\s+/).filter((p) => p.length > 2);
    if (palabras.length >= 2) return palabras.slice(0, 3).map((p) => p[0]).join("");
    return (palabras[0] || limpio.replace(/\s/g, "")).slice(0, 3);
  }

  window.crearTipoActivo = async function () {
    const etiqueta = document.getElementById("tipo-nuevo-etiqueta").value.trim();
    const prefijo = document.getElementById("tipo-nuevo-prefijo").value.trim().toUpperCase();
    const btn = document.getElementById("tipo-nuevo-btn");
    if (etiqueta.length < 3) { alert("Escriba el nombre del tipo (mínimo 3 letras)."); return; }
    if (!navigator.onLine) { alert("Sin conexión: cree el tipo cuando vuelva la señal."); return; }
    btn.disabled = true;
    try {
      const r = await fetch("/api/activos/tipos", {
        method: "POST",
        headers: window.geHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ etiqueta, prefijo: prefijo || undefined }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        // Si ya existe, se selecciona el que hay en vez de dejarlo atascado.
        if (d && d.existente) {
          await window.loadTiposActivo();
          selTipo().value = d.existente.clave;
          document.getElementById("tipo-nuevo-row").style.display = "none";
        }
        alert(d?.error || "No se pudo crear el tipo.");
        return;
      }
      await window.loadTiposActivo();
      selTipo().value = d.tipo.clave;
      document.getElementById("tipo-nuevo-row").style.display = "none";
      document.getElementById("tipo-nuevo-etiqueta").value = "";
      document.getElementById("tipo-nuevo-prefijo").value = "";
    } catch {
      alert("No se pudo crear el tipo (sin conexión con el motor).");
    } finally { btn.disabled = false; }
  };

  window.loadActivos = async function () {
    const cliente = document.getElementById("field-cliente").value.trim();
    if (!cliente || !navigator.onLine) return;
    try {
      const r = await fetch(`/api/activos?cliente=${encodeURIComponent(cliente)}`, { headers: window.geHeaders() });
      if (!r.ok) return;
      const { activos } = await r.json();
      const s = sel();
      const prev = s.value;
      s.innerHTML = baseOptions();
      for (const a of (activos || [])) {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = `${a.codigo}${a.nombre ? " · " + a.nombre : ""} ${SEMAFORO_ICON[a.semaforo] || ""}`.trim();
        s.insertBefore(o, s.querySelector('option[value="__nuevo"]'));
      }
      if (prev && prev !== "__nuevo") { ensureOption(prev); s.value = prev; }
    } catch { /* sin señal: el select conserva lo que tenga */ }
  };

  window.crearActivo = async function () {
    const cliente = document.getElementById("field-cliente").value.trim();
    const codigo = document.getElementById("activo-nuevo-codigo").value.trim().toUpperCase();
    const tipo = document.getElementById("activo-nuevo-tipo").value;
    const btn = document.getElementById("activo-nuevo-btn");
    if (!cliente) { alert("Escriba primero el nombre del cliente (la sede del activo)."); return; }
    if (!codigo) { alert("Escriba el código del activo (ej. TB-01)."); return; }
    if (tipo === "__nuevo_tipo") { alert("Cree primero el tipo nuevo, o elija uno de la lista."); return; }
    if (!navigator.onLine) { alert("Sin conexión: cree el activo cuando vuelva la señal."); return; }
    btn.disabled = true;
    try {
      const r = await fetch("/api/activos", {
        method: "POST",
        headers: window.geHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ cliente, codigo, tipo }),
      });
      if (!r.ok) {
        // El motor dice QUÉ falló (tipo desconocido, código repetido). Antes
        // salía siempre "motor no disponible", que no era ni cierto ni útil.
        const d = await r.json().catch(() => null);
        alert(d?.error || "No se pudo crear el activo (motor no disponible).");
        return;
      }
      const { activo } = await r.json();
      ensureOption(activo.id, activo.codigo);
      sel().value = activo.id;
      document.getElementById("activo-nuevo-row").style.display = "none";
      document.getElementById("activo-nuevo-codigo").value = "";
      if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
    } catch {
      alert("No se pudo crear el activo (sin conexión con el motor).");
    } finally { btn.disabled = false; }
  };

  document.addEventListener("DOMContentLoaded", () => {
    const s = sel();
    if (!s) return;
    s.addEventListener("change", () => {
      document.getElementById("activo-nuevo-row").style.display = s.value === "__nuevo" ? "" : "none";
      if (s.value !== "__nuevo" && typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
    });
    document.getElementById("field-cliente").addEventListener("blur", () => window.loadActivos());

    const st = selTipo();
    if (st) {
      st.addEventListener("change", () => {
        document.getElementById("tipo-nuevo-row").style.display = st.value === "__nuevo_tipo" ? "" : "none";
      });
    }
    const et = document.getElementById("tipo-nuevo-etiqueta");
    const pf = document.getElementById("tipo-nuevo-prefijo");
    if (et && pf) {
      et.addEventListener("input", () => {
        if (!pf.dataset.tocado) pf.value = sugerirPrefijo(et.value);
        const h = document.getElementById("tipo-nuevo-hint");
        const p = pf.value || "PREFIJO";
        if (h) h.textContent = `Los activos de este tipo se llamarán ${p}-1, ${p}-2…`;
      });
      pf.addEventListener("input", () => { pf.dataset.tocado = "1"; });
    }

    window.loadActivos();
    window.loadTiposActivo();
  });
})();
