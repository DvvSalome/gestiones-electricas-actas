// F6.8: galería "Mis clientes" — el técnico ve, en tarjetas, todos los
// clientes con los que ya trabajó, sin tener que recordar el nombre exacto
// con el que quedó guardado. Selecciona una tarjeta y queda en el mismo
// estado que si lo hubiera buscado y elegido en el combo del acta
// (window.seleccionarSede, ya definido en historial-cliente.js).
(function () {
  let sedes = [];
  let cargado = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function iniciales(nombre) {
    const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "—";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  function fechaCorta(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
    } catch { return ""; }
  }

  function render(lista) {
    const grid = document.getElementById("mcGrid");
    const empty = document.getElementById("mcEmpty");
    const emptyMsg = document.getElementById("mcEmptyMsg");
    if (!grid || !empty) return;

    if (!lista.length) {
      grid.innerHTML = "";
      grid.style.display = "none";
      empty.style.display = "block";
      if (emptyMsg) {
        emptyMsg.textContent = sedes.length
          ? "Ningún cliente coincide con esa búsqueda."
          : "Aún no ha trabajado con ningún cliente.";
      }
      return;
    }
    grid.style.display = "grid";
    empty.style.display = "none";
    grid.innerHTML = lista.map((s, i) => `
      <div class="mc-card" data-idx="${i}">
        <div class="mc-av">${esc(iniciales(s.name))}</div>
        <div class="mc-name">${esc(s.name)}</div>
        ${s.city ? `<div class="mc-city">${esc(s.city)}</div>` : ""}
        <span class="mc-count">${s.numServicios || 0} servicio${s.numServicios == 1 ? "" : "s"}</span>
        ${s.ultimaVisita ? `<div class="mc-date">Última visita: ${esc(fechaCorta(s.ultimaVisita))}</div>` : ""}
      </div>`).join("");

    grid.querySelectorAll(".mc-card").forEach((el, i) => {
      el.addEventListener("click", () => seleccionar(lista[i]));
    });
  }

  function seleccionar(sede) {
    if (typeof window.seleccionarSede === "function") {
      window.seleccionarSede({ id: sede.id, name: sede.name, city: sede.city });
    }
    window.MisClientes.close();
    if (window.app && app.toast) app.toast(`Cliente "${sede.name}" seleccionado`);
  }

  async function cargar() {
    const grid = document.getElementById("mcGrid");
    if (grid) grid.innerHTML = '<div class="mc-empty" style="grid-column:1/-1;padding:20px 0">Cargando…</div>';
    try {
      const r = await fetch("/api/sedes/recientes", { headers: window.geHeaders() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      sedes = d.sedes || [];
      cargado = true;
      const q = (document.getElementById("mcSearchInput") || {}).value || "";
      render(q ? filtrar(q) : sedes);
    } catch (e) {
      console.error("[mis-clientes] cargar", e);
      if (grid) grid.innerHTML = '<div class="mc-empty" style="grid-column:1/-1;padding:20px 0">No se pudo cargar. Verifique su conexión.</div>';
      const empty = document.getElementById("mcEmpty");
      if (empty) empty.style.display = "none";
    }
  }

  function filtrar(q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return sedes;
    return sedes.filter((s) =>
      String(s.name || "").toLowerCase().includes(needle) ||
      String(s.city || "").toLowerCase().includes(needle)
    );
  }

  window.MisClientes = {
    open() {
      document.getElementById("overlayMisClientes").classList.add("open");
      document.getElementById("floatingMisClientes").classList.add("open");
      const input = document.getElementById("mcSearchInput");
      if (input) input.value = "";
      if (!cargado) void cargar();
      else render(sedes);
    },
    close() {
      document.getElementById("overlayMisClientes").classList.remove("open");
      document.getElementById("floatingMisClientes").classList.remove("open");
    },
    filter(q) {
      render(filtrar(q));
    },
    refresh() {
      cargado = false;
      void cargar();
    },
  };
})();
