const VALID_PIN = "4321"; // Ejemplo de PIN

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

// Permitir login con enter
document.getElementById("pin-input")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") checkPin();
});

window.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("ge_admin_auth") === "true") {
    document.getElementById("login-overlay").style.display = "none";
    document.getElementById("main-content").style.display = "block";
    loadData();
  }
});

async function loadData() {
  try {
    const res = await fetch('/api/forms');
    const data = await res.json();
    
    if (data.forms) {
      renderDashboard(data.forms);
    } else {
      renderDashboard([]);
    }
  } catch (e) {
    console.error("Error loading forms:", e);
    document.getElementById("table-body").innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--brand-danger);">Error de conexión con la base de datos</td></tr>`;
  }
}

function renderDashboard(forms) {
  // Metrics
  document.getElementById("metric-total").textContent = forms.length;
  
  const today = new Date().toLocaleDateString('es-CO');
  const todayCount = forms.filter(f => {
    if(!f.created_at) return false;
    return new Date(f.created_at).toLocaleDateString('es-CO') === today;
  }).length;
  document.getElementById("metric-today").textContent = todayCount;

  const okCount = forms.filter(f => f.estado_final === "si").length;
  document.getElementById("metric-ok").textContent = okCount;

  // Table
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  if (forms.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--brand-gray);">No hay registros de actas todavía.</td></tr>`;
    return;
  }

  forms.forEach(f => {
    const tr = document.createElement("tr");
    
    let dateStr = "—";
    if (f.created_at) {
      const d = new Date(f.created_at);
      dateStr = d.toLocaleDateString('es-CO') + " " + d.toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
    }

    let statusBadge = `<span class="status-badge status-ok">Conforme</span>`;
    if (f.estado_final === "parcial") {
      statusBadge = `<span class="status-badge status-warn">Parcial</span>`;
    } else if (f.estado_final === "no") {
      statusBadge = `<span class="status-badge status-fail">Riesgo</span>`;
    }

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td style="font-weight: 600; color: var(--brand-neon);">${f.ot || "—"}</td>
      <td>${f.cliente || "—"}</td>
      <td>${f.direccion || "—"}</td>
      <td>${f.tecnico || "—"}</td>
      <td>${f.tension ? f.tension + ' V' : "—"}</td>
      <td>${f.corriente ? f.corriente + ' A' : "—"}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}
