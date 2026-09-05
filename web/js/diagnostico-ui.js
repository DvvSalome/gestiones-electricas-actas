// --- Diagnóstico IA por ACTA (batch) + revisión paso a paso ---
// Rediseño UX de campo (feedback de Adrián):
//  · UN solo botón: analiza TODAS las fotos juntas (una corrida del motor,
//    sin hallazgos duplicados entre ángulos del mismo sitio).
//  · Los hallazgos NO se apilan en el formulario: viven en un overlay tipo
//    wizard — un hallazgo a la vez, botones grandes, cero scroll del acta.
//  · Calificar (✓/✗) avanza solo al siguiente pendiente.
// Degradación elegante: sin motor, el acta funciona igual.
(function () {
  const NAVY = "#1F1F40", LIMA = "#C9E400";
  const ESTADO = {
    NC: { c: "#c0392b", bg: "#fbeceb", label: "No cumple" },
    C:  { c: "#4c7a1f", bg: "#eef7e3", label: "Conforme" },
    D:  { c: "#2471a3", bg: "#eaf2f8", label: "Documental" },
    S:  { c: "#7d3c98", bg: "#f4ecf7", label: "En sitio" },
  };
  const serverSlots = new Set();
  let batch = null;   // { inspection_id, status, findings[] }
  let poll = null;
  let idx = 0;

  // ── estilos + esqueleto del overlay (auto-inyectados) ──
  function inject() {
    if (document.getElementById("dgx-styles")) return;
    const st = document.createElement("style");
    st.id = "dgx-styles";
    st.textContent = `
      #diag-global{margin-top:14px}
      .dgx-btn{width:100%;min-height:52px;border:none;border-radius:14px;font-family:inherit;font-weight:800;font-size:14.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
      .dgx-btn:active{transform:scale(.985)}
      .dgx-main{background:${LIMA};color:${NAVY};box-shadow:0 3px 10px rgba(201,228,0,.35)}
      .dgx-card{border:1px solid #e3e6da;border-radius:14px;background:#fff;padding:13px 14px}
      .dgx-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px}
      .dgx-ov{position:fixed;inset:0;background:rgba(31,31,64,.55);z-index:900;display:none;opacity:0;transition:opacity .18s}
      .dgx-ov.open{display:block;opacity:1}
      .dgx-sheet{position:fixed;left:0;right:0;bottom:0;top:max(28px, env(safe-area-inset-top));margin:0 auto;max-width:600px;background:#fafbf4;z-index:901;border-radius:20px 20px 0 0;display:none;flex-direction:column;transform:translateY(24px);opacity:0;transition:all .22s cubic-bezier(.4,0,.2,1)}
      .dgx-sheet.open{display:flex;transform:none;opacity:1}
      .dgx-head{background:${NAVY};color:#fff;border-radius:20px 20px 0 0;padding:13px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
      .dgx-head b{font-size:14px;flex:1}
      .dgx-x{width:38px;height:38px;border:none;border-radius:11px;background:rgba(255,255,255,.14);color:#fff;font-size:16px;cursor:pointer;flex-shrink:0}
      .dgx-dots{display:flex;gap:5px;padding:11px 16px 0;flex-wrap:wrap;flex-shrink:0}
      .dgx-dot{height:5px;flex:1;min-width:14px;border-radius:99px;background:#e3e6da}
      .dgx-dot.on{background:${LIMA}}
      .dgx-dot.rev{background:#b7c98f}
      .dgx-body{flex:1;overflow-y:auto;padding:14px 16px;-webkit-overflow-scrolling:touch}
      .dgx-foot{flex-shrink:0;padding:10px 16px calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e3e6da;display:flex;flex-direction:column;gap:8px}
      .dgx-row{display:flex;gap:8px}
      .dgx-ok{flex:1;min-height:54px;border-radius:14px;border:none;background:#4c7a1f;color:#fff;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer}
      .dgx-no{flex:1;min-height:54px;border-radius:14px;border:2px solid #eec9c5;background:#fff;color:#c0392b;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer}
      .dgx-add{min-height:46px;border-radius:12px;border:2px solid ${LIMA};background:#fff;color:${NAVY};font-weight:800;font-size:13.5px;font-family:inherit;cursor:pointer}
      .dgx-nav{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .dgx-arrow{min-width:76px;min-height:42px;border-radius:11px;border:1.5px solid #e3e6da;background:#fff;color:${NAVY};font-weight:800;font-size:13px;font-family:inherit;cursor:pointer}
      .dgx-arrow:disabled{opacity:.35;cursor:default}
      .dgx-cita{background:#f5f7ef;border:1px solid #e3e6da;border-radius:11px;margin-top:11px;font-size:12px}
      .dgx-cita summary{padding:9px 12px;font-weight:800;color:#5c6600;cursor:pointer;list-style:none}
      .dgx-cita summary::-webkit-details-marker{display:none}
      .dgx-cita div{padding:0 12px 10px;color:#6b7280;font-style:italic;line-height:1.5}
      .dgx-motivo input{width:100%;min-height:48px;border:1.5px solid #e3e6da;border-radius:12px;padding:10px 12px;font-size:14px;font-family:inherit;color:${NAVY}}
      @media (min-width:640px){.dgx-sheet{top:auto;max-height:88vh;height:auto;min-height:60vh;bottom:24px;border-radius:20px}.dgx-head{border-radius:20px 20px 0 0}}
    `;
    document.head.appendChild(st);
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="dgx-ov" id="dgx-ov" onclick="cerrarDiagStepper()"></div>
      <div class="dgx-sheet" id="dgx-sheet" role="dialog" aria-modal="true">
        <div class="dgx-head"><b id="dgx-title">Diagnóstico IA</b><button type="button" class="dgx-x" onclick="cerrarDiagStepper()" aria-label="Cerrar">✕</button></div>
        <div class="dgx-dots" id="dgx-dots"></div>
        <div class="dgx-body" id="dgx-body"></div>
        <div class="dgx-foot" id="dgx-foot"></div>
      </div>`;
    document.body.appendChild(wrap);
  }

  function globalEl() {
    inject();
    let el = document.getElementById("diag-global");
    if (!el) {
      const card = document.getElementById("card-fotografica");
      if (!card) return null;
      el = document.createElement("div");
      el.id = "diag-global";
      card.appendChild(el);
    }
    return el;
  }

  // ── card global (bajo la sección de fotos) ──
  function renderGlobal() {
    const el = globalEl();
    if (!el) return;
    const n = serverSlots.size;

    if (batch && (batch.status === "running" || batch.status === "submitted" || batch.status === "pendiente")) {
      el.innerHTML = `<div class="dgx-card" style="background:#f5f7ef">
        <b style="color:${NAVY};font-size:13.5px">⏳ Analizando ${batch.fotos || n} foto(s) con IA…</b>
        <div style="font-size:12px;color:#6b7280;margin-top:3px">Tarda 1-2 minutos — siga llenando el acta, aquí aparece el resultado.</div>
      </div>`;
      return;
    }

    if (batch && batch.status === "completed") {
      const fs_ = batch.findings || [];
      if (!fs_.length) {
        el.innerHTML = `<div class="dgx-card" style="border-color:#d2e8bb;background:#eef7e3;color:#4c7a1f;font-size:13px"><b>✓ Sin hallazgos con respaldo normativo</b> en las ${batch.fotos || n} fotos.</div>
          ${botonRediag()}`;
        return;
      }
      const pend = fs_.filter((f) => !f.revisado).length;
      const chips = ["NC", "S", "D", "C"].map((e) => {
        const k = fs_.filter((f) => f.estado === e).length;
        if (!k) return "";
        const s = ESTADO[e];
        return `<span class="dgx-chip" style="background:${s.bg};color:${s.c}">${k} ${s.label}</span>`;
      }).join(" ");
      el.innerHTML = `<div class="dgx-card">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="color:${NAVY};font-size:14px">🧠 ${fs_.length} hallazgo(s)</b>${chips}
        </div>
        <button type="button" class="dgx-btn dgx-main" style="margin-top:10px" onclick="abrirDiagStepper()">
          ${pend ? `Revisar hallazgos (${pend} pendiente${pend === 1 ? "" : "s"}) →` : "✓ Todo revisado · ver hallazgos"}
        </button>
        ${botonRediag()}
      </div>`;
      return;
    }

    if (batch && batch.status === "failed_budget") {
      el.innerHTML = `<div class="dgx-card" style="border-color:#eec9c5;background:#fbeceb;color:#c0392b;font-size:12.5px">Presupuesto diario de IA agotado — continúe con diagnóstico manual; mañana se reinicia.</div>`;
      return;
    }
    if (batch && batch.status === "failed") {
      el.innerHTML = `<div class="dgx-card" style="border-color:#eec9c5;background:#fbeceb;color:#c0392b;font-size:12.5px">El motor no pudo analizar las fotos.</div>${botonRediag("Reintentar diagnóstico")}`;
      return;
    }

    // idle
    if (!n) { el.innerHTML = ""; return; }
    el.innerHTML = `<button type="button" class="dgx-btn" style="background:#fff;border:2px dashed ${LIMA};color:${NAVY}" onclick="dispararDiagnosticoActa()">🧠 Diagnosticar con IA (${n} foto${n === 1 ? "" : "s"})</button>
      <div style="font-size:11px;color:#9aa0a6;margin-top:5px;text-align:center">Analiza todas las fotos juntas — un solo análisis para todo el sitio.</div>`;
  }

  function botonRediag(label) {
    return `<button type="button" style="margin-top:8px;width:100%;min-height:40px;background:none;border:none;color:#9aa0a6;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:underline" onclick="if(confirm('Esto corre un análisis NUEVO con las fotos actuales (el anterior queda de historial). ¿Continuar?'))dispararDiagnosticoActa()">${label || "🔁 Re-diagnosticar con las fotos actuales"}</button>`;
  }

  // ── disparo + polling ──
  window.dispararDiagnosticoActa = async function () {
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    if (!uuid) return;
    batch = { status: "running", fotos: serverSlots.size, findings: [] };
    renderGlobal();
    try {
      // F6.2 fix: asegurar que el servidor YA tenga el nombre del cliente
      // recién escrito antes de crear la sede — el autoguardado normal tiene
      // debounce de 2s (autosave.js) y sin esto la sede podía crearse con el
      // nombre de respaldo genérico si el técnico disparaba el diagnóstico
      // enseguida de escribir el cliente.
      if (typeof window.flushDraftToServer === "function") await window.flushDraftToServer();
      const r = await fetch(`/api/actas/${uuid}/diagnostico`, { method: "POST", headers: window.geHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { batch = { status: "failed" }; renderGlobal(); return alertaSuave(d.error || "No se pudo iniciar el diagnóstico"); }
      batch.fotos = d.fotos;
      // F6.2: si esta sede es nueva, el motor devuelve el acceso al portal
      // (usuario + contraseña en texto plano, UNA sola vez). Se guarda aparte
      // de ge_form_draft porque ese objeto se reescribe entero en cada
      // pulsación de tecla (saveCurrentFormToLocal) y lo perdería enseguida.
      if (d.portalAccess) {
        window.portalAccess = d.portalAccess;
        localStorage.setItem("ge_portal_access", JSON.stringify(d.portalAccess));
      }
      startPoll();
    } catch {
      batch = null;
      renderGlobal();
      alertaSuave("Sin conexión con el motor — el acta sigue funcionando");
    }
  };

  function startPoll() {
    stopPoll();
    let tries = 0;
    poll = setInterval(async () => {
      if (++tries > 90) { stopPoll(); if (batch && batch.status === "running") { batch.status = "failed"; renderGlobal(); } return; }
      await refresh();
    }, 3000);
  }
  function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

  async function refresh() {
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    if (!uuid) return;
    try {
      const r = await fetch(`/api/actas/${uuid}/diagnostico`, { headers: window.geHeaders() });
      if (r.status === 404) return;
      if (!r.ok) return;
      const d = await r.json();
      const abierto = document.getElementById("dgx-sheet")?.classList.contains("open");
      batch = { ...batch, ...d, fotos: batch?.fotos };
      if (d.status === "completed" || d.status === "failed" || d.status === "failed_budget") stopPoll();
      renderGlobal();
      if (abierto) renderStep();
    } catch { /* siguiente tick */ }
  }

  // ── overlay paso a paso ──
  window.abrirDiagStepper = function () {
    if (!batch || !batch.findings?.length) return;
    inject();
    // arrancar en el primer pendiente
    const p = batch.findings.findIndex((f) => !f.revisado);
    idx = p >= 0 ? p : 0;
    document.getElementById("dgx-ov").classList.add("open");
    document.getElementById("dgx-sheet").classList.add("open");
    document.body.style.overflow = "hidden";
    renderStep();
  };
  window.cerrarDiagStepper = function () {
    document.getElementById("dgx-ov")?.classList.remove("open");
    document.getElementById("dgx-sheet")?.classList.remove("open");
    document.body.style.overflow = "";
    renderGlobal();
  };
  window.diagNav = function (delta) {
    idx = Math.max(0, Math.min((batch?.findings?.length || 1) - 1, idx + delta));
    renderStep();
  };

  function renderStep() {
    const fs_ = batch?.findings || [];
    if (!fs_.length) return;
    if (idx >= fs_.length) idx = fs_.length - 1;
    const f = fs_[idx];
    const s = ESTADO[f.estado] || { c: "#6b7280", bg: "#f3f4f6", label: f.estado };
    const pend = fs_.filter((x) => !x.revisado).length;

    document.getElementById("dgx-title").textContent = `Hallazgo ${idx + 1} de ${fs_.length}`;
    document.getElementById("dgx-dots").innerHTML = fs_.map((x, i) =>
      `<span class="dgx-dot ${i === idx ? "on" : x.revisado ? "rev" : ""}"></span>`).join("");

    const cita = f.citas && f.citas[0];
    document.getElementById("dgx-body").innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="dgx-chip" style="background:${s.bg};color:${s.c};border:1px solid ${s.c}">${f.estado} · ${s.label}</span>
        <span style="font-size:11.5px;color:#9aa0a6">confianza ${f.confianza}%</span>
        ${f.revisado ? (f.revisado === "correcto"
          ? `<span class="dgx-chip" style="background:#eef7e3;color:#4c7a1f">✓ confirmado</span>`
          : `<span class="dgx-chip" style="background:#fbeceb;color:#c0392b">✗ corregido</span>`) : ""}
      </div>
      <h3 style="font-size:17px;line-height:1.35;color:${NAVY};margin:10px 0 0">${esc(f.titulo)}</h3>
      ${f.descripcion ? `<p style="font-size:13.5px;color:#4b5563;line-height:1.55;margin:8px 0 0">${esc(f.descripcion)}</p>` : ""}
      ${cita ? `<details class="dgx-cita"><summary>📎 ${esc(cita.refPath)} · cita verificada</summary><div>"${esc(cita.quote || "")}"</div></details>` : ""}
      ${f._usado ? `<div style="margin-top:10px;font-size:12px;color:#5c6600;font-weight:800">➕ Agregado al diagnóstico del acta</div>` : ""}
      <div class="dgx-motivo" id="dgx-motivo" style="display:none;margin-top:11px"></div>`;

    const nav = `
      <div class="dgx-nav">
        <button type="button" class="dgx-arrow" onclick="diagNav(-1)" ${idx === 0 ? "disabled" : ""}>← Anterior</button>
        <span style="font-size:11.5px;color:#9aa0a6;font-weight:700">${pend ? `${pend} sin revisar` : "todo revisado ✓"}</span>
        <button type="button" class="dgx-arrow" onclick="diagNav(1)" ${idx === fs_.length - 1 ? "disabled" : ""}>Siguiente →</button>
      </div>`;

    document.getElementById("dgx-foot").innerHTML = f.revisado
      ? `${!f._usado && f.revisado === "correcto" ? `<button type="button" class="dgx-add" onclick="diagUsar(${idx})">➕ Usar en el acta</button>` : ""}${nav}`
      : `<div class="dgx-row">
           <button type="button" class="dgx-ok" onclick="diagReview(${idx},'correcto')">✓ Es correcto</button>
           <button type="button" class="dgx-no" onclick="diagPedirMotivo(${idx})">✗ No aplica</button>
         </div>
         <button type="button" class="dgx-add" onclick="diagUsar(${idx})">➕ Usar en el acta</button>
         ${nav}`;
  }

  function avanzarAlPendiente() {
    const fs_ = batch?.findings || [];
    const desde = fs_.slice(idx + 1).findIndex((f) => !f.revisado);
    if (desde >= 0) { idx = idx + 1 + desde; renderStep(); return; }
    const antes = fs_.findIndex((f) => !f.revisado);
    if (antes >= 0) { idx = antes; renderStep(); return; }
    renderFinal();
  }

  function renderFinal() {
    const fs_ = batch?.findings || [];
    const ok = fs_.filter((f) => f.revisado === "correcto").length;
    const no = fs_.filter((f) => f.revisado === "incorrecto").length;
    document.getElementById("dgx-title").textContent = "Revisión completa";
    document.getElementById("dgx-dots").innerHTML = fs_.map(() => `<span class="dgx-dot rev"></span>`).join("");
    document.getElementById("dgx-body").innerHTML = `
      <div style="text-align:center;padding:26px 6px">
        <div style="font-size:42px">🎉</div>
        <h3 style="color:${NAVY};font-size:18px;margin:10px 0 4px">Los ${fs_.length} hallazgos quedaron revisados</h3>
        <p style="font-size:13px;color:#6b7280">✓ ${ok} confirmado(s) · ✗ ${no} corregido(s) — el motor aprende de cada calificación.</p>
      </div>`;
    document.getElementById("dgx-foot").innerHTML = `<button type="button" class="dgx-btn dgx-main" onclick="cerrarDiagStepper()">Volver al acta</button>`;
  }

  // ── acciones ──
  const CHECKLIST_MAP = [
    [/tablero|gabinete|celda|envolvente/i, "tablero"],
    [/breaker|protecci[oó]n|termomagn|interruptor|sobrecorriente/i, "breakers"],
    [/acometida|medidor|medici[oó]n/i, "acometida"],
    [/conductor|cable|canaliz|empalme|aislamiento/i, "conductores"],
    [/tierra|spt|electrodo|equipotencial/i, "puesta_tierra"],
    [/tomacorriente|gfci|salida/i, "tomacorrientes"],
    [/luminaria|iluminaci[oó]n|l[aá]mpara/i, "iluminacion"],
    [/se[ñn]al|advertencia|riesgo el[eé]ctrico|r[oó]tul/i, "senalizacion"],
  ];
  function marcarChecklistFalla(texto) {
    const hit = CHECKLIST_MAP.find(([re]) => re.test(texto));
    if (!hit) return;
    const i = (window.checklistItems || []).findIndex((c) => c.id === hit[1]);
    if (i < 0) return;
    window.checklistItems[i].state = "fail";
    const div = document.querySelector(`.chk-item[data-index="${i}"]`);
    if (div) {
      div.classList.remove("ok");
      div.classList.add("fail");
      const st = div.querySelector(".chk-state");
      if (st) st.textContent = "FALLA";
    }
  }

  window.diagUsar = function (i) {
    const f = batch?.findings?.[i];
    if (!f || f._usado) return;
    const campo = document.getElementById("field-diagnostico");
    if (campo) {
      const cita = f.citas && f.citas[0] ? ` (${f.citas[0].refPath})` : "";
      const linea = `• ${f.titulo}${cita}: ${f.descripcion || ""}`.trim();
      campo.value = campo.value ? `${campo.value}\n${linea}` : linea;
    }
    marcarChecklistFalla(`${f.titulo} ${f.descripcion || ""}`);
    f._usado = true;
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
    renderStep();
  };

  window.diagReview = async function (i, veredicto, motivo) {
    const f = batch?.findings?.[i];
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    if (!f || !uuid || f.revisado) return;
    try {
      const r = await fetch(`/api/actas/${uuid}/diagnostico/review`, {
        method: "POST",
        headers: window.geHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ finding_id: f.id, veredicto, motivo }),
      });
      if (!r.ok) throw new Error();
      f.revisado = veredicto;
      renderStep();
      setTimeout(avanzarAlPendiente, 450);
    } catch {
      alertaSuave("No se pudo enviar — reintente con señal");
    }
  };

  window.diagPedirMotivo = function (i) {
    const box = document.getElementById("dgx-motivo");
    if (!box) return;
    box.style.display = "block";
    box.innerHTML = `
      <input id="dgx-motivo-in" placeholder="¿Por qué no aplica? (ej: no es un tablero…)" autocomplete="off">
      <button type="button" class="dgx-btn" style="margin-top:8px;background:#c0392b;color:#fff;min-height:46px;font-size:13.5px" onclick="(function(){var v=document.getElementById('dgx-motivo-in').value.trim();if(v.length>=3)window.diagReview(${i},'incorrecto',v)})()">Enviar corrección</button>`;
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    box.querySelector("input")?.focus();
  };

  function alertaSuave(msg) {
    const el = globalEl();
    if (!el) return;
    const d = document.createElement("div");
    d.style.cssText = "margin-top:6px;font-size:12px;color:#c0392b;font-weight:700";
    d.textContent = msg;
    el.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ── nudge antes de firmar: los hallazgos sin calificar son el entrenamiento ──
  window.diagPendientes = function () {
    return (batch?.findings || []).filter((f) => !f.revisado).length;
  };
  // muestra el aviso; si el técnico decide seguir, llama a continuar()
  window.diagNudgeAntesDeFirmar = function (continuar) {
    const n = window.diagPendientes();
    if (!n) return continuar();
    inject();
    const old = document.getElementById("dgx-nudge");
    if (old) old.remove();
    const m = document.createElement("div");
    m.id = "dgx-nudge";
    m.style.cssText = "position:fixed;inset:0;z-index:950;background:rgba(31,31,64,.6);display:flex;align-items:center;justify-content:center;padding:20px";
    m.innerHTML = `<div style="background:#fff;border-radius:18px;max-width:400px;width:100%;padding:22px;font-family:inherit">
      <div style="font-size:34px;text-align:center">🧠</div>
      <h3 style="color:${NAVY};font-size:16.5px;text-align:center;margin:8px 0 6px">Hay ${n} hallazgo${n === 1 ? "" : "s"} de IA sin revisar</h3>
      <p style="font-size:13px;color:#6b7280;text-align:center;line-height:1.5;margin:0 0 16px">Tu calificación (✓/✗) entrena al motor y respalda el acta. Toma menos de un minuto.</p>
      <button type="button" class="dgx-btn dgx-main" id="dgx-nudge-rev">Revisar ahora (${n})</button>
      <button type="button" style="width:100%;min-height:44px;background:none;border:none;color:#9aa0a6;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:6px;text-decoration:underline" id="dgx-nudge-skip">Firmar de todas formas</button>
    </div>`;
    document.body.appendChild(m);
    document.getElementById("dgx-nudge-rev").onclick = () => { m.remove(); window.abrirDiagStepper(); };
    document.getElementById("dgx-nudge-skip").onclick = () => { m.remove(); continuar(); };
  };

  // ── hooks del resto del acta ──
  // foto llegó al servidor → cuenta para el batch
  window.showDiagButton = function (slot) {
    serverSlots.add(slot);
    if (!batch || batch.status === "idle") renderGlobal();
    else renderGlobal();
  };
  // foto eliminada → descontar
  window.diagPhotoRemoved = function (slot) {
    serverSlots.delete(slot);
    renderGlobal();
  };
  // restaurar al cargar el acta (server = fuente de verdad)
  window.initDiagSlots = function (fotos) {
    for (const f of fotos || []) serverSlots.add(f.slot);
    const con = (fotos || []).some((f) => f.inspection_id);
    if (con) {
      batch = batch || { status: "running", fotos: serverSlots.size, findings: [] };
      void refresh();
      startPoll(); // si ya está completed, el primer refresh detiene el poll
    }
    renderGlobal();
  };

  document.addEventListener("DOMContentLoaded", inject);
})();
