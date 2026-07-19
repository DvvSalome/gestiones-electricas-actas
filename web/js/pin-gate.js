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
  };

  window.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("ge_tecnico_token")) window.showPinGate();
  });
})();
