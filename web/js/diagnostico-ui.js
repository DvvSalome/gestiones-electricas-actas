// --- F3.2: card "Diagnosticar con IA" por foto ---
// Bajo demanda (control de costo): el técnico decide qué foto analiza.
// La card vive bajo el slot de la foto; el análisis tarda 1-2 min y el
// técnico sigue llenando el acta (polling 3s al proxy). Degradación
// elegante: sin motor, el acta funciona igual.
(function () {
  const NAVY = "#1F1F40", LIMA = "#C9E400";
  const ESTADO_COLOR = { NC: "#c0392b", C: "#4c7a1f", D: "#2471a3", S: "#7d3c98" };
  const polls = {}; // slot → interval

  function slotContainer(slot) {
    const prev = document.getElementById(`preview-${slot}`);
    return prev ? prev.closest(".photo-slot") || prev.parentElement : null;
  }

  function cardEl(slot) {
    let el = document.getElementById(`diag-${slot}`);
    if (!el) {
      const cont = slotContainer(slot);
      if (!cont) return null;
      el = document.createElement("div");
      el.id = `diag-${slot}`;
      el.style.cssText = "margin-top:8px;font-family:inherit";
      cont.insertAdjacentElement("afterend", el);
    }
    return el;
  }

  // botón inicial (aparece cuando la foto ya está en el servidor)
  window.showDiagButton = function (slot) {
    const el = cardEl(slot);
    if (!el || el.dataset.state === "done" || el.dataset.state === "analizando") return;
    el.dataset.state = "idle";
    el.innerHTML = `<button type="button" onclick="dispararDiagnostico('${slot}')" style="width:100%;min-height:44px;background:#fff;border:1.5px dashed ${LIMA};color:${NAVY};font-weight:800;font-size:13px;border-radius:12px;cursor:pointer;font-family:inherit">🧠 Diagnosticar con IA</button>`;
  };

  window.dispararDiagnostico = async function (slot) {
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    const el = cardEl(slot);
    if (!uuid || !el) return;
    renderAnalizando(el);
    try {
      const r = await fetch(`/api/actas/${uuid}/fotos/${slot}/diagnostico`, { method: "POST", headers: window.geHeaders() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        return renderError(el, slot, d.error || "No se pudo iniciar el diagnóstico");
      }
      startPolling(slot);
    } catch {
      renderError(el, slot, "Sin conexión con el motor — el acta sigue funcionando");
    }
  };

  function startPolling(slot) {
    stopPolling(slot);
    let tries = 0;
    polls[slot] = setInterval(async () => {
      tries += 1;
      if (tries > 60) { // ~3 min: pasar a reintento manual
        stopPolling(slot);
        const el = cardEl(slot);
        if (el && el.dataset.state === "analizando") renderError(el, slot, "El análisis tomó demasiado — reintente en un momento");
        return;
      }
      await refreshDiag(slot);
    }, 3000);
  }
  function stopPolling(slot) { if (polls[slot]) { clearInterval(polls[slot]); delete polls[slot]; } }

  async function refreshDiag(slot) {
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    const el = cardEl(slot);
    if (!uuid || !el) return;
    try {
      const r = await fetch(`/api/actas/${uuid}/fotos/${slot}/diagnostico`, { headers: window.geHeaders() });
      if (r.status === 404) return; // sin diagnóstico aún
      if (!r.ok) return;            // transitorio: el próximo tick reintenta
      const d = await r.json();
      if (d.findings && d.findings.length) renderFindings(el, slot, d);
      if (d.status === "completed") { stopPolling(slot); el.dataset.state = "done"; if (!d.findings?.length) renderSinHallazgos(el, slot); }
      else if (d.status === "failed_budget") { stopPolling(slot); renderError(el, slot, "Presupuesto diario de IA agotado — continúe con diagnóstico manual; mañana se reinicia"); }
      else if (d.status === "failed") { stopPolling(slot); renderError(el, slot, "El motor no pudo analizar esta foto"); }
    } catch { /* siguiente tick */ }
  }

  function renderAnalizando(el) {
    el.dataset.state = "analizando";
    el.innerHTML = `<div style="border:1px solid #e3e6da;background:#f5f7ef;border-radius:12px;padding:10px 12px;font-size:12.5px;color:#6b7280">
      <b style="color:${NAVY}">⏳ Analizando con IA…</b> puede tardar 1-2 minutos — siga llenando el acta.
    </div>`;
  }

  function renderError(el, slot, msg) {
    el.dataset.state = "idle";
    el.innerHTML = `<div style="border:1px solid #eec9c5;background:#fbeceb;border-radius:12px;padding:10px 12px;font-size:12px;color:#c0392b">${msg}</div>
      <button type="button" onclick="dispararDiagnostico('${slot}')" style="margin-top:6px;width:100%;min-height:40px;background:#fff;border:1.5px dashed ${LIMA};color:${NAVY};font-weight:800;font-size:12.5px;border-radius:12px;cursor:pointer;font-family:inherit">Reintentar diagnóstico</button>`;
  }

  function renderSinHallazgos(el) {
    el.innerHTML = `<div style="border:1px solid #d2e8bb;background:#eef7e3;border-radius:12px;padding:10px 12px;font-size:12.5px;color:#4c7a1f"><b>✓ Sin hallazgos con respaldo normativo</b> en esta foto.</div>`;
  }

  function renderFindings(el, slot, d) {
    el.dataset.state = d.status === "completed" ? "done" : "analizando";
    const items = d.findings.map((f, i) => {
      const color = ESTADO_COLOR[f.estado] || "#6b7280";
      const cita = (f.citas && f.citas[0]) || null;
      return `<div style="border:1px solid #e3e6da;border-radius:12px;padding:11px 12px;margin-top:${i ? 8 : 0}px;background:#fff">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:999px;border:1px solid ${color};color:${color}">${f.estado}</span>
          <b style="font-size:13px;color:${NAVY};flex:1;min-width:150px">${escapeHtml(f.titulo)}</b>
          <span style="font-size:11px;color:#9aa0a6">${f.confianza}%</span>
        </div>
        ${f.descripcion ? `<div style="font-size:12px;color:#6b7280;margin-top:5px;line-height:1.45">${escapeHtml(f.descripcion)}</div>` : ""}
        ${cita ? `<div style="background:#f5f7ef;border:1px solid #e3e6da;border-radius:9px;padding:7px 10px;margin-top:7px;font-size:11px"><b style="color:#5c6600">📎 ${escapeHtml(cita.refPath)}</b> · cita verificada<div style="color:#6b7280;font-style:italic;margin-top:2px">"${escapeHtml((cita.quote || "").slice(0, 140))}${(cita.quote || "").length > 140 ? "…" : ""}"</div></div>` : ""}
        <div id="diag-acciones-${slot}-${i}" data-finding="${f.id}"></div>
      </div>`;
    }).join("");
    const head = d.status === "completed"
      ? `<div style="font-size:11px;color:#5c6600;font-weight:800;margin-bottom:6px">🧠 DIAGNÓSTICO IA · ${d.findings.length} hallazgo(s)</div>`
      : `<div style="font-size:11px;color:#9aa0a6;margin-bottom:6px">⏳ analizando… hallazgos parciales</div>`;
    el.innerHTML = head + items;
    renderDiagAcciones(slot, d);
  }

  // --- F3.3: acciones por hallazgo — cierran el círculo del aprendizaje ---
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
    if (!hit) return false;
    const idx = (window.checklistItems || []).findIndex((c) => c.id === hit[1]);
    if (idx < 0) return false;
    window.checklistItems[idx].state = "fail";
    const div = document.querySelector(`.check-item[data-index="${idx}"]`);
    if (div) {
      div.classList.remove("ok");
      div.classList.add("fail");
      const s = div.querySelector(".check-status");
      if (s) s.textContent = "FALLA";
    }
    return true;
  }

  function renderDiagAcciones(slot, d) {
    if (d.status !== "completed") return; // acciones solo con el análisis cerrado
    d.findings.forEach((f, i) => {
      const box = document.getElementById(`diag-acciones-${slot}-${i}`);
      if (!box) return;
      if (f.revisado) {
        box.innerHTML = f.revisado === "correcto"
          ? `<div style="margin-top:7px;font-size:11.5px;color:#4c7a1f;font-weight:700">✓ Confirmado — el motor aprende de ti</div>`
          : `<div style="margin-top:7px;font-size:11.5px;color:#c0392b;font-weight:700">✗ Corregido — el motor no repetirá este error</div>`;
        return;
      }
      box.innerHTML = `
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button type="button" onclick="diagUsar('${slot}',${i})" style="flex:1;min-width:130px;min-height:38px;background:${LIMA};color:${NAVY};font-weight:800;font-size:12px;border:none;border-radius:10px;cursor:pointer;font-family:inherit">➕ Usar en diagnóstico</button>
          <button type="button" onclick="diagReview('${slot}',${i},'correcto')" style="min-height:38px;background:#fff;border:1.5px solid #d2e8bb;color:#4c7a1f;font-weight:800;font-size:12px;border-radius:10px;cursor:pointer;padding:0 12px;font-family:inherit">✓</button>
          <button type="button" onclick="diagCorregir('${slot}',${i})" style="min-height:38px;background:#fff;border:1.5px solid #eec9c5;color:#c0392b;font-weight:800;font-size:12px;border-radius:10px;cursor:pointer;padding:0 12px;font-family:inherit">✗</button>
        </div>
        <div id="diag-motivo-${slot}-${i}" style="display:none;margin-top:6px"></div>`;
    });
    window._diagData = window._diagData || {};
    window._diagData[slot] = d;
  }

  window.diagUsar = function (slot, i) {
    const f = window._diagData?.[slot]?.findings?.[i];
    if (!f) return;
    const campo = document.getElementById("field-diagnostico");
    if (campo) {
      const cita = f.citas && f.citas[0] ? ` (${f.citas[0].refPath})` : "";
      const linea = `• ${f.titulo}${cita}: ${f.descripcion || ""}`.trim();
      campo.value = campo.value ? `${campo.value}\n${linea}` : linea;
    }
    marcarChecklistFalla(`${f.titulo} ${f.descripcion || ""}`);
    if (typeof saveCurrentFormToLocal === "function") saveCurrentFormToLocal();
    const box = document.getElementById(`diag-acciones-${slot}-${i}`);
    if (box) {
      const done = document.createElement("div");
      done.style.cssText = "margin-top:5px;font-size:11px;color:#5c6600;font-weight:700";
      done.textContent = "➕ Agregado al diagnóstico del acta";
      box.appendChild(done);
    }
  };

  window.diagReview = async function (slot, i, veredicto, motivo) {
    const f = window._diagData?.[slot]?.findings?.[i];
    const uuid = localStorage.getItem("ge_current_acta_uuid");
    if (!f || !uuid) return;
    const box = document.getElementById(`diag-acciones-${slot}-${i}`);
    try {
      const r = await fetch(`/api/actas/${uuid}/fotos/${slot}/diagnostico/review`, {
        method: "POST",
        headers: window.geHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ finding_id: f.id, veredicto, motivo }),
      });
      if (!r.ok) throw new Error();
      f.revisado = veredicto;
      if (box) box.innerHTML = veredicto === "correcto"
        ? `<div style="margin-top:7px;font-size:11.5px;color:#4c7a1f;font-weight:700">✓ Confirmado — el motor aprende de ti</div>`
        : `<div style="margin-top:7px;font-size:11.5px;color:#c0392b;font-weight:700">✗ Corregido — el motor no repetirá este error</div>`;
    } catch {
      if (box) {
        const err = document.createElement("div");
        err.style.cssText = "margin-top:5px;font-size:11px;color:#c0392b";
        err.textContent = "No se pudo enviar — reintente con señal";
        box.appendChild(err);
      }
    }
  };

  window.diagCorregir = function (slot, i) {
    const mbox = document.getElementById(`diag-motivo-${slot}-${i}`);
    if (!mbox) return;
    mbox.style.display = "block";
    mbox.innerHTML = `
      <input id="diag-motivo-input-${slot}-${i}" placeholder="¿Por qué es incorrecto? (ej: no es un tablero...)" style="width:100%;min-height:42px;border:1.5px solid #e3e6da;border-radius:10px;padding:10px 12px;font-size:13px;font-family:inherit;color:${NAVY}">
      <button type="button" onclick="(function(){var v=document.getElementById('diag-motivo-input-${slot}-${i}').value.trim();if(v.length>=3)window.diagReview('${slot}',${i},'incorrecto',v)})()" style="margin-top:6px;width:100%;min-height:38px;background:#c0392b;color:#fff;font-weight:800;font-size:12px;border:none;border-radius:10px;cursor:pointer;font-family:inherit">Enviar corrección</button>`;
    mbox.querySelector("input")?.focus();
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // restaurar estado al cargar (fotos ya en server, diagnósticos previos)
  window.initDiagSlots = function (fotos) {
    for (const f of fotos || []) {
      if (!slotContainer(f.slot)) continue; // extra-N sin DOM recreado: se omite
      if (f.inspection_id) { renderAnalizando(cardEl(f.slot)); void refreshDiag(f.slot); startPolling(f.slot); }
      else window.showDiagButton(f.slot);
    }
  };
})();
