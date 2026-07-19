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
    if (!navigator.onLine) { alert("Sin conexión: cree el activo cuando vuelva la señal."); return; }
    btn.disabled = true;
    try {
      const r = await fetch("/api/activos", {
        method: "POST",
        headers: window.geHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ cliente, codigo, tipo }),
      });
      if (!r.ok) { alert("No se pudo crear el activo (motor no disponible)."); return; }
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
    window.loadActivos();
  });
})();
