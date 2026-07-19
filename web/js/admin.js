const TOKEN_KEY = "ge_admin_token";

let ALL_FORMS = [];   // todas las actas cargadas de la nube
let VIEW_FORMS = [];  // subconjunto tras aplicar filtros

function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ""; }

// Extrae el usuario en sesión del propio token (payload firmado). No necesita
// llamar al servidor y funciona también al recargar la página.
function getUsername() {
  const t = getToken();
  if (!t || t.indexOf(".") < 0) return "";
  try {
    const payload = t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(payload);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data.u || "";
  } catch (e) { return ""; }
}

function showUserBadge() {
  const name = getUsername();
  const chip = document.getElementById("panel-user");
  if (!chip) return;
  if (name) {
    document.getElementById("panel-user-name").textContent = name;
    document.getElementById("pu-avatar").textContent = name.charAt(0).toUpperCase();
    chip.style.display = "inline-flex";
    document.title = `Panel de ${name} · Gestiones Eléctricas`;
  } else {
    chip.style.display = "none";
  }
}

function showPanel() {
  document.getElementById("login-overlay").style.display = "none";
  document.getElementById("main-content").style.display = "block";
  showUserBadge();
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

/* ── Gestión de usuarios del panel ── */
let PANEL_USERS = [];

function nuMsg(t, ok) {
  const msg = document.getElementById("nu-msg");
  msg.textContent = t; msg.className = "msg " + (ok ? "msg-ok" : "msg-error"); msg.style.display = "block";
}

function renderUsersList() {
  const cont = document.getElementById("users-list");
  cont.innerHTML = PANEL_USERS.map(u => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 12px; background:var(--cream); border:1px solid var(--line); border-radius:9px; margin-bottom:7px;">
      <span style="font-weight:600; color:var(--ink); font-size:13.5px;">${esc(u.username)}</span>
      <button class="btn btn-ghost" style="padding:4px 11px; font-size:11.5px;" onclick="deleteUser('${esc(u.username).replace(/'/g, "\\'")}')">Eliminar</button>
    </div>`).join('') || `<p style="font-size:13px; color:var(--muted);">Sin usuarios.</p>`;
}

function openUsers() {
  document.getElementById("nu-user").value = "";
  document.getElementById("nu-pass").value = "";
  document.getElementById("nu-msg").style.display = "none";
  document.getElementById("users-overlay").style.display = "flex";
  loadUsers();
}

async function loadUsers() {
  const cont = document.getElementById("users-list");
  cont.innerHTML = `<p style="font-size:13px; color:var(--muted);">Cargando…</p>`;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-users', token: getToken() }),
    });
    if (res.status === 401) { document.getElementById("users-overlay").style.display = "none"; logoutToLogin("Su sesión expiró. Ingrese de nuevo."); return; }
    const data = await res.json();
    PANEL_USERS = data.users || [];
    renderUsersList();
  } catch (e) {
    cont.innerHTML = `<p style="font-size:13px; color:var(--danger);">No se pudo cargar la lista de usuarios.</p>`;
  }
}

async function createUser() {
  const username = document.getElementById("nu-user").value.trim();
  const password = document.getElementById("nu-pass").value;
  if (!username) return nuMsg("Ingrese un nombre de usuario.", false);
  if (password.length < 8) return nuMsg("La contraseña debe tener al menos 8 caracteres.", false);
  try {
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-user', token: getToken(), username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo crear el usuario");
    // Optimista: reflejar de inmediato (la lista en la nube tarda unos segundos en refrescar).
    if (!PANEL_USERS.some(u => u.username.toLowerCase() === username.toLowerCase())) PANEL_USERS.push({ username });
    renderUsersList();
    nuMsg(`✓ Usuario "${username}" creado. Ya puede iniciar sesión.`, true);
    document.getElementById("nu-user").value = "";
    document.getElementById("nu-pass").value = "";
  } catch (e) { nuMsg(e.message || "Error", false); }
}

async function deleteUser(username) {
  if (!confirm(`¿Eliminar el usuario "${username}"? Esta acción no se puede deshacer.`)) return;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-user', token: getToken(), username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo eliminar el usuario");
    PANEL_USERS = PANEL_USERS.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    renderUsersList();
    nuMsg(`Usuario "${username}" eliminado.`, true);
  } catch (e) { nuMsg(e.message || "Error", false); }
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--muted);">Cargando registros…</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--danger);">No se pudo conectar con la base de datos (/api/forms). Verifique que el backend esté desplegado.</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--muted); padding:34px;">${ALL_FORMS.length === 0 ? "No hay registros de actas todavía." : "Ningún acta coincide con los filtros."}</td></tr>`;
    return;
  }

  forms.forEach(f => {
    let dateStr = "—";
    if (f.created_at) {
      const d = new Date(f.created_at);
      dateStr = d.toLocaleDateString('es-CO') + " " + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }
    const contacto = [f.telefono, f.email].filter(Boolean).map(esc).join("<br>") || "—";
    const fotos = (typeof f.num_fotos === "number") ? f.num_fotos : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-muted">${esc(dateStr)}</td>
      <td class="cell-ot">${esc(f.ot || "—")}</td>
      <td class="cell-strong">${esc(f.cliente || "—")}</td>
      <td class="cell-muted">${contacto}</td>
      <td class="cell-muted">${esc(f.direccion || "—")}</td>
      <td>${esc(f.tecnico || "—")}</td>
      <td class="cell-center">${fotos}</td>
      <td>${statusBadge(f.estado_final)}</td>
      <td>
        <button class="pdf-btn" onclick="downloadActaPDF('${esc(f.ot || "").replace(/'/g, "\\'")}')" title="Descargar acta en PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          PDF
        </button>
        <button class="pdf-btn" style="margin-top:4px" onclick="openEvidencia('${esc(f.ot || "").replace(/'/g, "\\'")}')" title="Ver fotos y firma reales">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>
          Evidencia
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── F2.6: modal de evidencia real (fotos con EXIF + firma + PDF archivado) ── */
async function fetchBlobURL(url) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + getToken() } });
  if (!r.ok) return null;
  return URL.createObjectURL(await r.blob());
}

async function openEvidencia(ot) {
  let modal = document.getElementById("evidencia-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "evidencia-modal";
    modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(31,31,64,.55);display:flex;align-items:center;justify-content:center;padding:20px";
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:720px;width:100%;max-height:86vh;overflow:auto;padding:22px;font-family:inherit">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <b style="font-size:16px">Evidencia · ${esc(ot)}</b>
      <button onclick="document.getElementById('evidencia-modal').remove()" style="border:none;background:#eef1e4;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px">×</button>
    </div>
    <div id="evidencia-body" style="color:#6b7280;font-size:13px">Cargando evidencia…</div>
  </div>`;

  const body = modal.querySelector("#evidencia-body");
  try {
    const r = await fetch(`/api/actas-full?ot=${encodeURIComponent(ot)}`, { headers: { Authorization: "Bearer " + getToken() } });
    if (r.status === 404) { body.innerHTML = "📄 Registro pre-VPS: la evidencia quedó solo en el PDF original que descargó el técnico."; return; }
    if (!r.ok) { body.innerHTML = "No se pudo cargar la evidencia."; return; }
    const a = await r.json();

    let html = `<div style="margin-bottom:12px;font-size:12.5px">Estado: <b>${esc(a.estado)}</b>${a.firma_at ? ` · Firmada: ${new Date(a.firma_at).toLocaleString("es-CO")}` : ""}</div>`;
    if (a.fotos.length) {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px" id="ev-fotos">` +
        a.fotos.map(f => `<figure style="margin:0"><div data-slot="${esc(f.slot)}" style="height:110px;background:#f5f7ef;border:1px solid #e3e6da;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#9aa0a6;font-size:11px;overflow:hidden">cargando…</div><figcaption style="font-size:10.5px;color:#6b7280;margin-top:3px">${esc(f.slot)} · ${(f.size_bytes/1024).toFixed(0)}KB${f.gps ? " · 📍" : ""}</figcaption></figure>`).join("") + `</div>`;
    } else { html += `<p>Sin fotos en servidor.</p>`; }
    html += `<div style="display:flex;gap:10px;flex-wrap:wrap">`;
    if (a.firma) html += `<div id="ev-firma" style="border:1px solid #e3e6da;border-radius:10px;padding:8px;min-width:180px"><div style="font-size:10.5px;color:#6b7280;margin-bottom:4px">Firma del cliente</div>cargando…</div>`;
    if (a.pdf) html += `<button id="ev-pdf" style="border:1.5px solid #e3e6da;background:#fff;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:700;font-size:13px;font-family:inherit">📄 Abrir PDF archivado</button>`;
    html += `</div>`;
    body.innerHTML = html;

    // cargar binarios con el token (los <img> no mandan Authorization)
    for (const f of a.fotos) {
      const u = await fetchBlobURL(`/api/actas/${a.uuid}/fotos/${encodeURIComponent(f.slot)}`);
      const box = body.querySelector(`[data-slot="${CSS.escape(f.slot)}"]`);
      if (box) box.innerHTML = u ? `<img src="${u}" style="width:100%;height:100%;object-fit:cover">` : "no disponible";
    }
    if (a.firma) {
      const u = await fetchBlobURL(`/api/actas/${a.uuid}/firma`);
      const fb = body.querySelector("#ev-firma");
      if (fb) fb.innerHTML = `<div style="font-size:10.5px;color:#6b7280;margin-bottom:4px">Firma del cliente</div>` + (u ? `<img src="${u}" style="max-width:220px;background:#fff">` : "no disponible");
    }
    if (a.pdf) {
      body.querySelector("#ev-pdf")?.addEventListener("click", async () => {
        const u = await fetchBlobURL(`/api/actas/${a.uuid}/pdf`);
        if (u) window.open(u, "_blank");
      });
    }
  } catch {
    body.innerHTML = "Error de conexión.";
  }
}

/* ── Descargar un acta como PDF (resumen desde el registro) ── */
function downloadActaPDF(ot) {
  const f = ALL_FORMS.find(x => x.ot === ot);
  if (!f) { alert("No se encontró el acta."); return; }
  if (!window.jspdf || !window.jspdf.jsPDF) { alert("No se pudo cargar el generador de PDF. Reintente."); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const OLIVE = [47, 58, 6], LIME = [199, 229, 47], INK = [35, 40, 15], INK2 = [74, 77, 56], MUT = [139, 138, 116], LINE = [231, 225, 208];

  const estadoTxt = f.estado_final === "no" ? "No conforme (riesgo)"
    : f.estado_final === "parcial" ? "Parcial (requiere adecuación)" : "Conforme";
  let fechaTxt = "—";
  if (f.created_at) { const d = new Date(f.created_at); fechaTxt = d.toLocaleDateString("es-CO") + " · " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }); }

  // Banda de encabezado
  doc.setFillColor.apply(doc, OLIVE); doc.rect(0, 0, W, 86, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("GESTIONES ELÉCTRICAS", M, 40);
  doc.setTextColor.apply(doc, LIME); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text("ACTA TÉCNICA DE SERVICIO", M, 57);
  doc.setTextColor.apply(doc, LIME); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(String(f.ot || "—"), W - M, 40, { align: "right" });
  doc.setTextColor(228, 234, 210); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(fechaTxt, W - M, 57, { align: "right" });

  let y = 118;
  const colL = M, colR = W / 2 + 6, colW = (W - 2 * M) / 2 - 6;

  function sectionTitle(t) {
    y += 4;
    doc.setTextColor.apply(doc, OLIVE); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
    doc.text(t.toUpperCase(), M, y);
    y += 7; doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.8); doc.line(M, y, W - M, y);
    y += 17;
  }
  function pair(x, w, label, value) {
    doc.setTextColor.apply(doc, MUT); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text(String(label).toUpperCase(), x, y);
    doc.setTextColor.apply(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(String(value || "—"), w);
    doc.text(lines, x, y + 13);
    return 13 + lines.length * 12 + 9;
  }
  function row(l1, v1, l2, v2) {
    const h1 = pair(colL, colW, l1, v1);
    const h2 = (l2 != null) ? pair(colR, colW, l2, v2) : 0;
    y += Math.max(h1, h2);
  }
  function full(label, value) { y += pair(colL, W - 2 * M, label, value); }

  sectionTitle("Identificación");
  row("Cliente", f.cliente, "Técnico", f.tecnico);
  row("Dirección", f.direccion, "Matrícula", f.matricula);
  row("Teléfono", f.telefono, "Correo", f.email);
  row("Tipo de servicio", f.tipo_servicio, "Ubicación GPS", f.gps);

  sectionTitle("Diagnóstico y mediciones");
  row("Tensión", f.tension ? f.tension + " V" : "—", "Corriente", f.corriente ? f.corriente + " A" : "—");
  full("Diagnóstico", f.diagnostico);
  full("Acciones realizadas", f.acciones);

  sectionTitle("Cierre y conformidad");
  row("Estado final", estadoTxt, "Fotos de evidencia", (typeof f.num_fotos === "number") ? f.num_fotos + " foto(s)" : "—");
  row("Recibido por", f.firmante_nombre, "Documento", f.firmante_documento);

  // Nota aclaratoria
  y += 8;
  const noteLines = doc.splitTextToSize("Nota: este documento es un resumen del acta generado desde el panel de trazabilidad. La evidencia fotográfica y la firma quedan en el PDF original del acta que se compartió al momento del servicio.", W - 2 * M - 20);
  const noteH = noteLines.length * 11 + 18;
  doc.setFillColor(246, 242, 233); doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.8);
  doc.rect(M, y, W - 2 * M, noteH, "FD");
  doc.setTextColor.apply(doc, INK2); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
  doc.text(noteLines, M + 10, y + 14);

  doc.setTextColor.apply(doc, MUT); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("Gestiones Eléctricas SAS · Soporte digital de servicio", M, H - 30);

  const dArch = f.created_at ? new Date(f.created_at) : new Date();
  const fechaArch = `${String(dArch.getDate()).padStart(2, "0")}-${String(dArch.getMonth() + 1).padStart(2, "0")}-${dArch.getFullYear()}`;
  const otArch = String(f.ot || "SN").replace(/[^a-z0-9\-]/gi, "");
  // Nombre del archivo: número de orden + Gestiones Eléctricas + fecha de creación del acta.
  doc.save(`Acta_${otArch}_Gestiones_Electricas_${fechaArch}.pdf`);
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
