const VALID_PIN = "4321"; // PIN de acceso al panel

let ALL_FORMS = [];   // todas las actas cargadas de la nube
let VIEW_FORMS = [];  // subconjunto tras aplicar filtros

function checkPin() {
  const input = document.getElementById("pin-input").value;
  if (input === VALID_PIN) {
    document.getElementById("login-overlay").style.display = "none";
    document.getElementById("main-content").style.display = "block";
    sessionStorage.setItem("ge_admin_auth", "true");
    loadData();
  } else {
    document.getElementById("login-error").style.display = "block";
  }
}

function logout() {
  sessionStorage.removeItem("ge_admin_auth");
  location.reload();
}

document.getElementById("pin-input")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") checkPin();
});

window.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("ge_admin_auth") === "true") {
    document.getElementById("login-overlay").style.display = "none";
    document.getElementById("main-content").style.display = "block";
    loadData();
  }
  // Los filtros se aplican en vivo
  ["filter-search", "filter-from", "filter-to", "filter-status"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", applyFilters);
  });
});

async function loadData() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--brand-gray);">Cargando registros…</td></tr>`;
  try {
    const res = await fetch('/api/forms?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    ALL_FORMS = Array.isArray(data.forms) ? data.forms : [];
    renderMetrics(ALL_FORMS);
    applyFilters();
  } catch (e) {
    console.error("Error loading forms:", e);
    ALL_FORMS = [];
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--brand-danger);">No se pudo conectar con la base de datos (/api/forms). Verifique que el backend esté desplegado.</td></tr>`;
  }
}

/* ── Métricas globales (sobre TODAS las actas, no las filtradas) ── */
function renderMetrics(forms) {
  const now = new Date();
  const todayStr = now.toLocaleDateString('es-CO');
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const dateOf = (f) => f.created_at ? new Date(f.created_at) : null;

  const total = forms.length;
  const today = forms.filter(f => { const d = dateOf(f); return d && d.toLocaleDateString('es-CO') === todayStr; }).length;
  const week = forms.filter(f => { const d = dateOf(f); return d && d >= weekAgo; }).length;
  const month = forms.filter(f => { const d = dateOf(f); return d && d >= monthStart; }).length;
  const okCount = forms.filter(f => f.estado_final === "si").length;
  const okPct = total ? Math.round((okCount / total) * 100) : 0;

  document.getElementById("metric-total").textContent = total;
  document.getElementById("metric-today").textContent = today;
  document.getElementById("metric-week").textContent = week;
  document.getElementById("metric-month").textContent = month;
  document.getElementById("metric-ok").textContent = okPct + "%";
}

/* ── Filtros (búsqueda + rango de fechas + estado) ── */
function applyFilters() {
  const q = (document.getElementById("filter-search")?.value || "").trim().toLowerCase();
  const from = document.getElementById("filter-from")?.value || "";
  const to = document.getElementById("filter-to")?.value || "";
  const status = document.getElementById("filter-status")?.value || "";

  const fromD = from ? new Date(from + "T00:00:00") : null;
  const toD = to ? new Date(to + "T23:59:59") : null;

  VIEW_FORMS = ALL_FORMS.filter(f => {
    if (status && f.estado_final !== status) return false;

    if (fromD || toD) {
      const d = f.created_at ? new Date(f.created_at) : null;
      if (!d) return false;
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
    }

    if (q) {
      const hay = [f.ot, f.cliente, f.direccion, f.tecnico, f.telefono, f.email, f.firmante_nombre]
        .map(v => (v || "").toString().toLowerCase()).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderTable(VIEW_FORMS);
}

function statusBadge(estado) {
  if (estado === "parcial") return `<span class="status-badge status-warn">Parcial</span>`;
  if (estado === "no") return `<span class="status-badge status-fail">Riesgo</span>`;
  return `<span class="status-badge status-ok">Conforme</span>`;
}

function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderTable(forms) {
  const tbody = document.getElementById("table-body");
  const count = document.getElementById("result-count");
  count.textContent = forms.length === ALL_FORMS.length
    ? `${forms.length} acta(s) en total`
    : `${forms.length} de ${ALL_FORMS.length} acta(s) (filtrado)`;

  tbody.innerHTML = "";
  if (forms.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--brand-gray);">${ALL_FORMS.length === 0 ? "No hay registros de actas todavía." : "Ningún acta coincide con los filtros."}</td></tr>`;
    return;
  }

  forms.forEach(f => {
    let dateStr = "—";
    if (f.created_at) {
      const d = new Date(f.created_at);
      dateStr = d.toLocaleDateString('es-CO') + " " + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }
    const contacto = [f.telefono, f.email].filter(Boolean).join("<br>") || "—";
    const fotos = (typeof f.num_fotos === "number") ? f.num_fotos : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="muted-cell">${esc(dateStr)}</td>
      <td style="font-weight:600; color: var(--brand-neon);">${esc(f.ot || "—")}</td>
      <td>${esc(f.cliente || "—")}</td>
      <td class="muted-cell">${contacto}</td>
      <td class="muted-cell">${esc(f.direccion || "—")}</td>
      <td>${esc(f.tecnico || "—")}</td>
      <td style="text-align:center;">${fotos}</td>
      <td>${statusBadge(f.estado_final)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── Exportar el conjunto filtrado a CSV ── */
function exportCSV() {
  const rows = VIEW_FORMS.length ? VIEW_FORMS : ALL_FORMS;
  if (!rows.length) { alert("No hay actas para exportar."); return; }

  const cols = [
    ["created_at", "Fecha"], ["ot", "OT"], ["cliente", "Cliente"],
    ["telefono", "Teléfono"], ["email", "Email"], ["direccion", "Dirección"],
    ["tipo_servicio", "Tipo de servicio"], ["tecnico", "Técnico"], ["matricula", "Matrícula"],
    ["tension", "Tensión (V)"], ["corriente", "Corriente (A)"],
    ["firmante_nombre", "Firmante"], ["firmante_documento", "Doc. Firmante"],
    ["num_fotos", "Fotos"], ["gps", "GPS"], ["estado_final", "Estado"],
  ];

  const q = (v) => {
    const s = (v == null ? "" : String(v)).replace(/"/g, '""');
    return `"${s}"`;
  };

  let csv = cols.map(c => q(c[1])).join(",") + "\r\n";
  rows.forEach(f => {
    csv += cols.map(c => q(f[c[0]])).join(",") + "\r\n";
  });

  // BOM para que Excel abra bien los acentos
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `actas_gestiones_electricas_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}
