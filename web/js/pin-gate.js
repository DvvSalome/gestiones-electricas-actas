// --- F2.5: Compuerta de PIN del técnico ---
// El acta del VPS exige sesión. Con token guardado (30 días) no molesta;
// sin token muestra usuario + PIN con la marca del cliente (lima/navy).
// Modo gracia: si el servidor no conoce login-tecnico (deploy Vercel viejo,
// pre-cutover), la compuerta se oculta y el form sigue como siempre.
(function () {
  const NAVY = "#1F1F40", LIMA = "#C9E400";

  function buildGate() {
    const el = document.createElement("div");
    el.id = "pin-gate";
    el.style.cssText = "position:fixed;inset:0;z-index:99999;background:#f5f7ef;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'DM Sans',system-ui,sans-serif";
    el.innerHTML = `
      <div style="width:min(380px,100%);background:#fff;border:1px solid #e3e6da;border-radius:18px;padding:26px;box-shadow:0 10px 40px rgba(31,31,64,.10)">
        <div style="text-align:center;margin-bottom:18px">
          <div style="font-weight:800;font-size:20px;letter-spacing:-.02em;color:${NAVY}">Acta Digital</div>
          <div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9aa0a6;font-weight:700">Gestiones Eléctricas</div>
        </div>
        <label style="display:block;margin-bottom:12px">
          <span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#9aa0a6;font-weight:800;margin-bottom:6px">Técnico</span>
          <input id="pin-user" autocomplete="username" style="width:100%;min-height:52px;border:1.5px solid #e3e6da;border-radius:13px;padding:14px 15px;font-size:16px;font-family:inherit;color:${NAVY}" placeholder="usuario">
        </label>
        <label style="display:block;margin-bottom:14px">
          <span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#9aa0a6;font-weight:800;margin-bottom:6px">PIN</span>
          <input id="pin-code" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" style="width:100%;min-height:52px;border:1.5px solid #e3e6da;border-radius:13px;padding:14px 15px;font-size:22px;letter-spacing:.35em;font-family:inherit;color:${NAVY};text-align:center" placeholder="••••">
        </label>
        <div id="pin-error" style="display:none;color:#c0392b;font-size:13px;margin-bottom:10px"></div>
        <button id="pin-submit" style="width:100%;min-height:56px;background:${LIMA};color:${NAVY};font-weight:800;font-size:17px;border:none;border-radius:14px;cursor:pointer;font-family:inherit;box-shadow:0 6px 18px rgba(146,208,80,.35)">Entrar</button>
        <div style="text-align:center;color:#9aa0a6;font-size:11.5px;margin-top:12px">La sesión queda guardada 30 días en este dispositivo</div>
      </div>`;
    document.body.appendChild(el);

    const err = el.querySelector("#pin-error");
    async function submit() {
      const username = el.querySelector("#pin-user").value.trim();
      const pin = el.querySelector("#pin-code").value.trim();
      if (!username || !/^\d{4,6}$/.test(pin)) {
        err.textContent = "Ingrese usuario y PIN de 4 a 6 dígitos";
        err.style.display = "block";
        return;
      }
      try {
        const r = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login-tecnico", username, pin }),
        });
        if (r.ok) {
          const { token, username: name } = await r.json();
          localStorage.setItem("ge_tecnico_token", token);
          localStorage.setItem("ge_tecnico_nombre", name);
          toggleLogout(true);
          const ft = document.getElementById("field-tecnico");
          if (ft && !ft.value) { ft.value = name; if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal(); }
          el.remove();
          if (typeof initOTNumber === "function" && !localStorage.getItem("ge_current_ot")) initOTNumber();
          if (window.flushOfflineQueue) void window.flushOfflineQueue();
          return;
        }
        if (r.status === 400) { el.remove(); return; } // server viejo sin login-tecnico → modo gracia
        const d = await r.json().catch(() => ({}));
        err.textContent = d.error || "Usuario o PIN incorrectos";
        err.style.display = "block";
      } catch {
        // sin señal: dejar trabajar — la cola offline sincroniza después
        err.textContent = "Sin conexión — puede trabajar offline; la evidencia se sincroniza al volver la señal";
        err.style.display = "block";
        setTimeout(() => el.remove(), 1800);
      }
    }
    el.querySelector("#pin-submit").addEventListener("click", submit);
    el.querySelector("#pin-code").addEventListener("keydown", (e) => { if (e.key === "Enter") void submit(); });
  }

  window.showPinGate = function () {
    if (!document.getElementById("pin-gate")) buildGate();
    toggleLogout(false); // con el gate visible no se ofrece "Salir"
  };

  // --- F2.5 fix: validación de sesión + logout ---
  function b64urlDecode(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return atob(s);
  }
  // true solo si el token existe, tiene formato y NO está expirado (chequeo local, sirve offline)
  function tokenVigente(token) {
    if (!token || token.indexOf(".") < 1) return false;
    try {
      const data = JSON.parse(b64urlDecode(token.split(".")[0]));
      return !!data.exp && Date.now() < data.exp;
    } catch { return false; }
  }
  function limpiarSesion() {
    localStorage.removeItem("ge_tecnico_token");
    localStorage.removeItem("ge_tecnico_nombre");
  }
  function toggleLogout(show) {
    const b = document.getElementById("btn-logout");
    if (b) b.style.display = show ? "inline-flex" : "none";
  }
  window.geLogout = function () {
    limpiarSesion();
    toggleLogout(false);
    window.showPinGate();
  };
  // Verifica el token contra el server cuando hay señal; si el server lo rechaza
  // (firma/rotación de secreto/usuario borrado), cierra la sesión. Sin señal no bloquea
  // (el acta funciona offline: la cola sincroniza después).
  async function verificarConServidor(token) {
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", token }),
      });
      if (r.status === 401) window.geLogout();
      // 200 = ok · 400 = server viejo sin 'verify' (modo gracia) → no hacer nada
    } catch { /* sin señal: se respeta el trabajo offline */ }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const lb = document.getElementById("btn-logout");
    if (lb) lb.addEventListener("click", () => {
      if (confirm("¿Cerrar sesión? Tendrá que ingresar su usuario y PIN de nuevo.")) window.geLogout();
    });

    const token = localStorage.getItem("ge_tecnico_token");
    // BUG FIX: antes bastaba con que el token EXISTIERA en localStorage para entrar,
    // así que al recargar con un token viejo/expirado el usuario aparecía "dentro"
    // sin sesión válida. Ahora se valida: sin token vigente → limpiar y exigir PIN.
    if (!tokenVigente(token)) {
      if (token) limpiarSesion();
      window.showPinGate();
      return;
    }
    // token vigente localmente → app + botón Salir; se confirma con el server en 2º plano.
    toggleLogout(true);
    verificarConServidor(token);
  });
})();
