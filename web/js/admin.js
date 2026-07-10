const TOKEN_KEY = "ge_admin_token";

let ALL_FORMS = [];   // todas las actas cargadas de la nube
let VIEW_FORMS = [];  // subconjunto tras aplicar filtros

function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ""; }

function showPanel() {
  document.getElementById("login-overlay").style.display = "none";
  document.getElementById("main-content").style.display = "block";
}
function showLogin(msg) {
  document.getElementById("login-overlay").style.display = "flex";
  document.getElementById("main-content").style.display = "none";
  if (msg) {
    const e = document.getElementById("login-error");
    e.textContent = msg; e.style.display = "block";
  }
}

async function doLogin() {
  const username = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  const errEl = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");
  errEl.style.display = "none";
  if (!username || !password) { errEl.textContent = "Ingrese usuario y contraseña."; errEl.style.display = "block"; return; }

  btn.disabled = true; btn.textContent = "Ingresando…";
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    sessionStorage.setItem(TOKEN_KEY, data.token);
    document.getElementById("login-pass").value = "";
    showPanel();
    loadData();
  } catch (e) {
    errEl.textContent = e.message || 'Error de conexión';
    errEl.style.display = "block";
  } finally {
    btn.disabled = false; btn.textContent = "Ingresar";
  }
}

function logout() {
  stopAutoRefresh();
  sessionStorage.removeItem(TOKEN_KEY);
  location.reload();
}

function logoutToLogin(msg) {
  stopAutoRefresh();
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin(msg);
}

/* ── Auto-actualización del panel (cada 25 s, sin recargar la página) ── */
let AUTO_REFRESH_ID = null;
function startAutoRefresh() {
  if (AUTO_REFRESH_ID) return; // ya está corriendo
  AUTO_REFRESH_ID = setInterval(() => loadData(true), 25000);
}
function stopAutoRefresh() {
  if (AUTO_REFRESH_ID) { clearInterval(AUTO_REFRESH_ID); AUTO_REFRESH_ID = null; }
}
function updateRefreshStamp() {
  const el = document.getElementById("refresh-stamp");
  if (!el) return;
  const t = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.textContent = "Actualizado " + t;
}

/* ── Cambio de contraseña ── */
function openChangePassword() {
  document.getElementById("pw-current").value = "";
  document.getElementById("pw-new").value = "";
  document.getElementById("pw-new2").value = "";
  const m = document.getElementById("pw-msg"); m.style.display = "none";
  document.getElementById("pw-overlay").style.display = "flex";
}
async function doChangePassword() {
  const currentPassword = document.getElementById("pw-current").value;
  const newPassword = document.getElementById("pw-new").value;
  const rep = document.getElementById("pw-new2").value;
  const msg = document.getElementById("pw-msg");
  const setMsg = (t, ok) => { msg.textContent = t; msg.style.color = ok ? "var(--brand-success)" : "var(--brand-danger)"; msg.style.display = "block"; };

  if (newPassword.length < 8) return setMsg("La nueva contraseña debe tener al menos 8 caracteres.", false);
  if (newPassword !== rep) return setMsg("Las contraseñas no coinciden.", false);

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change-password', token: getToken(), currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña');
    setMsg("✓ Contraseña actualizada. Vuelva a iniciar sesión.", true);
    setTimeout(logout, 1500);
  } catch (e) {
    setMsg(e.message || 'Error', false);
  }
}

document.getElementById("login-pass")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") doLogin();
});

window.addEventListener("DOMContentLoaded", () => {
  if (getToken()) { showPanel(); loadData(); }
  else showLogin();
  // Los filtros se aplican en vivo
  ["filter-search", "filter-from", "filter-to", "filter-status"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", applyFilters);
  });
});

async function loadData(silent) {
  const tbody = document.getElementById("table-body");
  if (!silent) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--brand-gray);">Cargando registros…</td></tr>`;
  }
  try {
    const res = await fetch('/api/forms?t=' + Date.now(), {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });
    if (res.status === 401) { logoutToLogin("Su sesión expiró. Ingrese de nuevo."); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    ALL_FORMS = Array.isArray(data.forms) ? data.forms : [];
    renderMetrics(ALL_FORMS);
    applyFilters();
    updateRefreshStamp();
    startAutoRefresh();
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
