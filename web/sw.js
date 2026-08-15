// Service worker del Acta Digital — PWA robusta para campo.
// Objetivo: ABRIR EN FRÍO SIN SEÑAL (el shell completo vive en cache).
// Los DATOS nunca pasan por aquí: /api/* va directo a red (la cola offline
// de IndexedDB ya maneja actas/fotos sin señal).
// v9: fix de firma en móvil (touchcancel, botón "Forzar Guardado", condición
// de carrera en el resize del canvas) — los 3 PRs de hoy (31-33) NUNCA
// bumpearon esto, así que cualquier teléfono con la PWA ya abierta seguía
// sirviendo signature.js/pdf-generator.js/index.html VIEJOS vía
// stale-while-revalidate (sirve caché primero SIEMPRE, refresca en segundo
// plano solo para la próxima carga) — el service worker no tenía forma de
// darse cuenta de que el contenido cambió si su propio archivo no cambiaba.
// v7: Tensión/Corriente en cajas segmentadas (teclado numérico puro, / automático)
const VERSION = "ge-acta-v9";

const SHELL = [
  "/actas",
  "/images/icon-192.png",
  "/manifest.json",
  "/html2pdf.bundle.min.js",
  "/images/icon-192.png",
  "/images/icon-512.png",
  "/images/logo-simbolo.png",
  "/js/config.js",
  "/js/offline-queue.js",
  "/js/pin-gate.js",
  "/js/diagnostico-ui.js",
  "/js/utils.js",
  "/js/gps.js",
  "/js/checklist.js",
  "/js/materials.js",
  "/js/activos.js",
  "/js/images.js",
  "/js/signature.js",
  "/js/timeline.js",
  "/js/autosave.js",
  "/js/pdf-generator.js",
  "/js/main.js",
  "/js/pwa.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // datos y mutaciones: SIEMPRE red (la cola offline del app maneja los fallos)
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // navegación (abrir la app): red primero, cache si no hay señal
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/actas", copy));
          return res;
        })
        .catch(() => caches.match("/actas")),
    );
    return;
  }

  // estáticos (propios y CDN): stale-while-revalidate — rápido offline,
  // se refresca solo cuando hay señal
  e.respondWith(
    caches.match(req).then((hit) => {
      const refresco = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresco;
    }),
  );
});
