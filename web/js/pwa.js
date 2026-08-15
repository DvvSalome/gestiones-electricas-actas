// Registro del service worker + aviso de instalación (PWA de campo).
(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* http local o navegador viejo */ });
  });

  // F-móvil: hasta ahora, ver un deploy nuevo en el celular requería cerrar
  // la app del todo y reabrirla — la caché stale-while-revalidate de sw.js
  // sirve JS viejo hasta que algo fuerza al service worker a tomar control.
  // NO se recarga sola: el técnico puede tener fotos/checklist sin guardar
  // en memoria (no todo sobrevive un reload) y forzar el refresh a mitad de
  // acta le podría borrar trabajo en curso. Se ofrece, no se impone.
  //
  // "controllerchange" dispara tanto en la instalación inicial (controller
  // pasa de null a la primera SW) como en una actualización real (pasa de
  // una SW activa a otra más nueva) — solo la segunda es "hay una
  // actualización". Se distingue capturando si YA había un controller activo
  // ANTES de que el evento disparara.
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;
  let updateBarShown = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadControllerAtLoad || updateBarShown) return;
    updateBarShown = true;
    const bar = document.createElement("div");
    bar.id = "pwa-update-bar";
    bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:900;background:#0D1100;color:#fff;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:13px";
    bar.innerHTML = `<span style="flex:1"><b style="color:#C7E52F">Hay una actualización</b> del acta lista — toca para aplicarla.</span>
      <button id="pwa-update-si" style="background:#C7E52F;color:#0D1100;border:none;border-radius:10px;min-height:40px;padding:0 14px;font-weight:800;font-family:inherit;cursor:pointer">Actualizar</button>`;
    document.body.appendChild(bar);
    document.getElementById("pwa-update-si").onclick = () => window.location.reload();
  });

  // instalación con un toque (Android/Chrome): guardamos el prompt y mostramos
  // una barrita discreta — en iOS no existe el evento (se instala desde Compartir).
  let prompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt = e;
    if (localStorage.getItem("ge_pwa_dismissed")) return;
    const bar = document.createElement("div");
    bar.id = "pwa-bar";
    bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:800;background:#0D1100;color:#fff;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:13px";
    bar.innerHTML = `<span style="flex:1"><b style="color:#C7E52F">Instala el Acta GE</b> — abre sin señal desde tu pantalla de inicio.</span>
      <button id="pwa-si" style="background:#C7E52F;color:#0D1100;border:none;border-radius:10px;min-height:40px;padding:0 14px;font-weight:800;font-family:inherit;cursor:pointer">Instalar</button>
      <button id="pwa-no" style="background:none;border:none;color:#9aa08a;font-size:16px;cursor:pointer;min-width:36px;min-height:40px">✕</button>`;
    document.body.appendChild(bar);
    document.getElementById("pwa-si").onclick = async () => {
      bar.remove();
      if (prompt) { prompt.prompt(); await prompt.userChoice; prompt = null; }
    };
    document.getElementById("pwa-no").onclick = () => {
      localStorage.setItem("ge_pwa_dismissed", "1");
      bar.remove();
    };
  });
})();
