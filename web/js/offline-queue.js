// --- F2.4: Cola offline con IndexedDB ---
// localStorage (~5MB) no alcanza para fotos originales + PDF. Todo lo que no
// pueda subirse en el momento (sin señal, server caído, acta aún sin uuid)
// se encola aquí y se reintenta al volver la conexión. El PDF client-side
// sigue funcionando SIEMPRE como fallback — esta cola solo garantiza que la
// evidencia TAMBIÉN llegue al servidor tarde o temprano.
(function () {
  const DB_NAME = "ge-actas-queue";
  const STORE = "pending";   // blobs: fotos / firma / pdf (autoIncrement)
  const DRAFTS = "drafts";   // borradores coalescidos por uuid (put reemplaza)

  let _db = null;
  function openDb() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true });
        if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS);
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => reject(t.error);
    }));
  }

  // ── encolar ──
  // item: {kind:'foto'|'firma'|'pdf', uuid|null, slot?, gps?, blob?, json?, fileName?, ts}
  window.queueOffline = function (item) {
    item.ts = Date.now();
    return tx(STORE, "readwrite", (s) => s.add(item)).catch(() => { /* IDB no disponible: queda el PDF local */ });
  };
  window.queueDraft = function (uuid, payload) {
    return tx(DRAFTS, "readwrite", (s) => s.put({ payload, ts: Date.now() }, uuid || "sin-uuid")).catch(() => {});
  };

  // ── asegurar acta en server (para lo encolado sin uuid: acta nacida offline) ──
  async function ensureUuid() {
    let uuid = localStorage.getItem("ge_current_acta_uuid");
    if (uuid) return uuid;
    const r = await fetch("/api/actas", { method: "POST", headers: { "Content-Type": "application/json" } });
    if (!r.ok) throw new Error("sin server");
    const { uuid: u, ot } = await r.json();
    localStorage.setItem("ge_current_acta_uuid", u);
    localStorage.removeItem("ge_ot_offline");
    // Adoptar el OT del server SOLO si el técnico no firmó aún (si ya firmó o
    // generó PDF, el OT visual viejo queda — el uuid manda para la evidencia).
    if (!window.signatureConfirmed && !window.lastGeneratedPdfBlob) {
      localStorage.setItem("ge_current_ot", ot);
      if (typeof paintOT === "function") paintOT(ot);
    }
    return u;
  }

  // ── vaciar la cola ──
  let _flushing = false;
  window.flushOfflineQueue = async function () {
    if (_flushing || !navigator.onLine) return;
    _flushing = true;
    try {
      // 1) items con blob
      const keys = await tx(STORE, "readonly", (s) => s.getAllKeys());
      for (const key of keys || []) {
        const item = await tx(STORE, "readonly", (s) => s.get(key));
        if (!item) continue;
        try {
          const uuid = item.uuid || await ensureUuid();
          let res;
          if (item.kind === "foto") {
            const fd = new FormData();
            fd.append("foto", item.blob, item.fileName || item.slot);
            fd.append("slot", item.slot);
            if (item.gps) fd.append("gps", item.gps);
            res = await fetch(`/api/actas/${uuid}/fotos`, { method: "POST", body: fd });
          } else if (item.kind === "firma") {
            res = await fetch(`/api/actas/${uuid}/firma`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.json),
            });
          } else if (item.kind === "pdf") {
            const fd = new FormData();
            fd.append("pdf", item.blob, item.fileName || "acta.pdf");
            res = await fetch(`/api/actas/${uuid}/pdf`, { method: "POST", body: fd });
          } else { res = { ok: true, status: 200 }; }
          // éxito o error permanente (acta inexistente / payload inválido) → sacar de la cola
          if (res.ok || res.status === 404 || res.status === 400) {
            await tx(STORE, "readwrite", (s) => s.delete(key));
          }
        } catch { /* sigue en cola para el próximo intento */ }
      }
      // 2) borradores coalescidos
      const dKeys = await tx(DRAFTS, "readonly", (s) => s.getAllKeys());
      for (const dk of dKeys || []) {
        const d = await tx(DRAFTS, "readonly", (s) => s.get(dk));
        if (!d) continue;
        try {
          const uuid = dk !== "sin-uuid" ? dk : await ensureUuid();
          const res = await fetch(`/api/actas/${uuid}/draft`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d.payload),
          });
          if (res.ok || res.status === 404 || res.status === 400) {
            await tx(DRAFTS, "readwrite", (s) => s.delete(dk));
          }
        } catch { /* reintenta luego */ }
      }
    } finally { _flushing = false; }
  };

  // disparadores: volver de offline, al cargar, y tick de respaldo cada 60s
  window.addEventListener("online", () => { void window.flushOfflineQueue(); });
  window.addEventListener("DOMContentLoaded", () => { setTimeout(() => void window.flushOfflineQueue(), 3000); });
  setInterval(() => { void window.flushOfflineQueue(); }, 60000);
})();
