// Registro del service worker + aviso de instalación (PWA de campo).
(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* http local o navegador viejo */ });
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
