// F3: el Motor RETIE dentro del acta — proxy servidor-a-servidor.
// ⚠️ Correcciones del crítico (OBLIGATORIAS):
//  - UNA inspección del motor POR DIAGNÓSTICO (por foto), NUNCA por OT: el
//    pipeline es destructivo (borra findings al re-correr) y cacheado — el
//    vínculo vive en acta_fotos.inspection_id.
//  - La inspección se crea CON la foto en el mismo multipart (attach posterior
//    no existe en el motor).
//  - siteName = nombre canónico del CLIENTE (no la dirección texto libre).
//  - El browser JAMÁS habla con el motor: solo este proxy con el service token.
const fs = require('fs');
const { getPool } = require('../db');

const MOTOR_URL = process.env.MOTOR_URL || 'https://electroscan.gestioneselectricas.com';
const TOKEN = process.env.MOTOR_SERVICE_TOKEN || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT_RE = /^[a-z]+(-\d+)?$/;

function svcHeaders(extra) {
  return Object.assign({ 'x-service-token': TOKEN }, extra || {});
}

// ── POST /api/actas/:uuid/fotos/:slot/diagnostico · dispara el motor (bajo demanda) ──
async function disparar(req, res) {
  const u = req.params.uuid, slot = req.params.slot;
  if (!UUID_RE.test(u) || !SLOT_RE.test(slot)) return res.status(400).json({ error: 'inválido' });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const p = getPool();
    const { rows: [foto] } = await p.query(
      'SELECT f.path, f.mime, f.gps, f.inspection_id, a.ot, a.data FROM actas.acta_fotos f JOIN actas.actas a ON a.uuid = f.acta_uuid WHERE f.acta_uuid = $1 AND f.slot = $2',
      [u, slot],
    );
    if (!foto) return res.status(404).json({ error: 'La foto aún no está en el servidor (suba la foto primero)' });
    if (!fs.existsSync(foto.path)) return res.status(404).json({ error: 'Archivo de foto no disponible' });

    // política #11: re-diagnosticar = NUEVA inspección; la anterior queda de historial
    const d = foto.data || {};
    // siteName canónico: el CLIENTE del acta (no la dirección) — evita sedes basura
    const siteName = (d.cliente && String(d.cliente).trim().slice(0, 120)) || 'Gestiones Eléctricas — Terreno';

    const fd = new FormData();
    fd.set('payload', JSON.stringify({
      siteName,
      siteCity: 'Barranquilla',
      hdv: {
        tipoInstalacion: 'comercial',
        nivelTension: 'BT',
        proceso: 'mantenimiento',
        observaciones: `Acta ${foto.ot} · foto ${slot} · diagnóstico bajo demanda desde el Acta Digital${d.diagnostico ? ` · contexto del técnico: ${String(d.diagnostico).slice(0, 300)}` : ''}`,
      },
      notas: `acta:${u} slot:${slot}`,
    }));
    const buf = fs.readFileSync(foto.path);
    fd.set('fotos', new Blob([buf], { type: foto.mime || 'image/jpeg' }), `${slot}.jpg`);

    const r = await fetch(`${MOTOR_URL}/api/inspections`, { method: 'POST', headers: svcHeaders(), body: fd });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[diagnostico] motor respondió', r.status, t.slice(0, 200));
      return res.status(502).json({ error: 'El motor no aceptó el diagnóstico', detalle: r.status });
    }
    // F6.2: si esta es la PRIMERA vez que el motor ve esta sede, la respuesta
    // trae portalAccess (usuario + contraseña en texto plano, una sola vez —
    // el motor solo guarda el hash). Se persiste en el acta para que
    // pdf-generator.js lo imprima en el documento final.
    const { id: inspectionId, portalAccess } = await r.json();
    await p.query('UPDATE actas.acta_fotos SET inspection_id = $3 WHERE acta_uuid = $1 AND slot = $2', [u, slot, inspectionId]);
    if (portalAccess) {
      await p.query('UPDATE actas.actas SET data = data || $2::jsonb WHERE uuid = $1', [u, JSON.stringify({ portalAccess })]);
    }
    return res.json({ inspection_id: inspectionId, estado: 'analizando', nota: 'El análisis puede tardar 1-2 minutos; puede seguir llenando el acta.', portalAccess });
  } catch (e) {
    console.error('[diagnostico:disparar]', e);
    return res.status(502).json({ error: 'Motor no disponible — el acta sigue funcionando sin diagnóstico' });
  }
}

// ── GET /api/actas/:uuid/fotos/:slot/diagnostico · estado + hallazgos destilados ──
async function estado(req, res) {
  const u = req.params.uuid, slot = req.params.slot;
  if (!UUID_RE.test(u) || !SLOT_RE.test(slot)) return res.status(400).json({ error: 'inválido' });
  try {
    const { rows: [foto] } = await getPool().query(
      'SELECT inspection_id, finding_ids FROM actas.acta_fotos WHERE acta_uuid = $1 AND slot = $2', [u, slot],
    );
    if (!foto?.inspection_id) return res.status(404).json({ error: 'Sin diagnóstico para esta foto' });

    const r = await fetch(`${MOTOR_URL}/api/inspections/${foto.inspection_id}/events`, { headers: svcHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Motor no disponible', status: 'desconocido' });
    const data = await r.json();
    const findings = (data.findings || []).map((f) => ({
      id: f.id,
      titulo: f.titulo,
      descripcion: f.descripcion,
      estado: f.estado,
      severidad: f.severidad,
      confianza: f.confianza,
      revisado: f.goldenLabel || null, // correcto | incorrecto | null (F3.3)
      citas: (f.citas || []).filter((c) => c.validated).map((c) => ({ refPath: c.refPath, quote: c.quote })),
    }));
    // persistir vínculo finding_ids (semilla de la hoja de vida F4)
    if (findings.length) {
      await getPool().query('UPDATE actas.acta_fotos SET finding_ids = $3 WHERE acta_uuid = $1 AND slot = $2',
        [u, slot, findings.map((f) => f.id)]);
    }
    return res.json({
      inspection_id: foto.inspection_id,
      status: data.status,
      ultimo_evento: (data.events || []).slice(-1)[0]?.message || null,
      findings,
    });
  } catch (e) {
    console.error('[diagnostico:estado]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── POST /api/actas/:uuid/fotos/:slot/diagnostico/review · confirmar/corregir (F3.3) ──
// ⚠️ Corrección del crítico: el proxy VALIDA que el finding pertenezca a la
// inspección vinculada a ESTA foto antes de proxear el PATCH (el motor no
// tiene tenant-check en review). La etiqueta alimenta el aprendizaje en
// caliente del motor (goldenLabel/reviewMotivo → getLearningPromptBlock).
async function review(req, res) {
  const u = req.params.uuid, slot = req.params.slot;
  if (!UUID_RE.test(u) || !SLOT_RE.test(slot)) return res.status(400).json({ error: 'inválido' });
  const { finding_id, veredicto, motivo } = req.body || {};
  if (!UUID_RE.test(String(finding_id || ''))) return res.status(400).json({ error: 'finding_id inválido' });
  if (veredicto !== 'correcto' && veredicto !== 'incorrecto') return res.status(400).json({ error: 'veredicto debe ser correcto|incorrecto' });
  try {
    const p = getPool();
    const { rows: [foto] } = await p.query(
      `SELECT f.inspection_id, f.finding_ids, a.ot, a.data->>'activo_id' AS activo_id
       FROM actas.acta_fotos f JOIN actas.actas a ON a.uuid = f.acta_uuid
       WHERE f.acta_uuid = $1 AND f.slot = $2`, [u, slot],
    );
    if (!foto?.inspection_id) return res.status(404).json({ error: 'Sin diagnóstico para esta foto' });

    // validar pertenencia; si finding_ids está desactualizado, refrescar del motor UNA vez
    let ids = foto.finding_ids || [];
    if (!ids.includes(finding_id)) {
      const r = await fetch(`${MOTOR_URL}/api/inspections/${foto.inspection_id}/events`, { headers: svcHeaders() });
      if (r.ok) {
        const data = await r.json();
        ids = (data.findings || []).map((f) => f.id);
        if (ids.length) await p.query('UPDATE actas.acta_fotos SET finding_ids = $3 WHERE acta_uuid = $1 AND slot = $2', [u, slot, ids]);
      }
    }
    if (!ids.includes(finding_id)) {
      return res.status(403).json({ error: 'El hallazgo no pertenece al diagnóstico de esta foto' });
    }

    // proveniencia en el motivo (dataset de aprendizaje con contexto de campo)
    const quien = req.actor?.username || 'tecnico';
    const motivoFinal = veredicto === 'incorrecto'
      ? `[acta ${foto.ot} · ${quien}] ${String(motivo || 'sin detalle').slice(0, 800)}`
      : undefined;

    // F4.2: si el acta tiene activo seleccionado, la calificación ancla el
    // hallazgo a su hoja de vida (el motor recalcula el semáforo del activo)
    const assetId = UUID_RE.test(String(foto.activo_id || '')) ? foto.activo_id : undefined;
    const pr = await fetch(`${MOTOR_URL}/api/findings/${finding_id}/review`, {
      method: 'PATCH',
      headers: svcHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ veredicto, ...(motivoFinal ? { motivo: motivoFinal } : {}), ...(assetId ? { assetId } : {}) }),
    });
    if (!pr.ok) return res.status(502).json({ error: 'El motor no aceptó la revisión' });
    return res.json({ success: true, veredicto });
  } catch (e) {
    console.error('[diagnostico:review]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ══════════════════════════════════════════════════════════════════════
// Batch por ACTA (mejora UX/costo pedida por Adrián): las N fotos del mismo
// sitio van juntas en UNA inspección → una sola corrida del pipeline, sin
// hallazgos duplicados entre ángulos de la misma acometida. Sigue siendo
// inspección-por-DIAGNÓSTICO (corrección del crítico): re-diagnosticar crea
// inspección NUEVA con las fotos actuales y la anterior queda de historial.
// ══════════════════════════════════════════════════════════════════════

// ── POST /api/actas/:uuid/diagnostico · todas las fotos en una inspección ──
async function actaDisparar(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'inválido' });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const p = getPool();
    const { rows: fotos } = await p.query(
      `SELECT f.slot, f.path, f.mime, a.ot, a.data
       FROM actas.acta_fotos f JOIN actas.actas a ON a.uuid = f.acta_uuid
       WHERE f.acta_uuid = $1 ORDER BY f.tomada_at`, [u],
    );
    const listas = fotos.filter((f) => fs.existsSync(f.path));
    if (!listas.length) return res.status(404).json({ error: 'Suba al menos una foto al servidor primero' });

    const d = listas[0].data || {};
    const siteName = (d.cliente && String(d.cliente).trim().slice(0, 120)) || 'Gestiones Eléctricas — Terreno';
    const fd = new FormData();
    fd.set('payload', JSON.stringify({
      siteName,
      siteCity: 'Barranquilla',
      hdv: {
        tipoInstalacion: 'comercial',
        nivelTension: 'BT',
        proceso: 'mantenimiento',
        observaciones: `Acta ${listas[0].ot} · ${listas.length} fotos del MISMO sitio (${listas.map((f) => f.slot).join(', ')}) — analizar en conjunto, sin duplicar hallazgos entre ángulos${d.diagnostico ? ` · contexto del técnico: ${String(d.diagnostico).slice(0, 300)}` : ''}`,
      },
      notas: `acta:${u} batch:${listas.map((f) => f.slot).join(',')}`,
    }));
    for (const f of listas) {
      fd.append('fotos', new Blob([fs.readFileSync(f.path)], { type: f.mime || 'image/jpeg' }), `${f.slot}.jpg`);
    }

    const r = await fetch(`${MOTOR_URL}/api/inspections`, { method: 'POST', headers: svcHeaders(), body: fd });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[diag-batch] motor respondió', r.status, t.slice(0, 200));
      return res.status(502).json({ error: 'El motor no aceptó el diagnóstico', detalle: r.status });
    }
    // F6.2: ver comentario equivalente en disparar() más arriba.
    const { id: inspectionId, portalAccess } = await r.json();
    // el vínculo queda en TODAS las fotos del lote (la fuente de verdad del acta)
    await p.query(`UPDATE actas.acta_fotos SET inspection_id = $2, finding_ids = '{}' WHERE acta_uuid = $1`, [u, inspectionId]);
    if (portalAccess) {
      await p.query('UPDATE actas.actas SET data = data || $2::jsonb WHERE uuid = $1', [u, JSON.stringify({ portalAccess })]);
    }
    return res.json({ inspection_id: inspectionId, fotos: listas.length, estado: 'analizando', portalAccess });
  } catch (e) {
    console.error('[diag-batch:disparar]', e);
    return res.status(502).json({ error: 'Motor no disponible — el acta sigue funcionando sin diagnóstico' });
  }
}

// inspección vigente del acta = la compartida por más fotos (la del último batch)
async function inspeccionDelActa(p, u) {
  const { rows: [r] } = await p.query(
    `SELECT inspection_id, count(*) AS n, max(tomada_at) AS t
     FROM actas.acta_fotos WHERE acta_uuid = $1 AND inspection_id IS NOT NULL
     GROUP BY inspection_id ORDER BY n DESC, t DESC LIMIT 1`, [u],
  );
  return r ? r.inspection_id : null;
}

// ── GET /api/actas/:uuid/diagnostico · estado + hallazgos del batch ──
async function actaEstado(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'inválido' });
  try {
    const p = getPool();
    const inspectionId = await inspeccionDelActa(p, u);
    if (!inspectionId) return res.status(404).json({ error: 'Sin diagnóstico para esta acta' });

    const r = await fetch(`${MOTOR_URL}/api/inspections/${inspectionId}/events`, { headers: svcHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Motor no disponible', status: 'desconocido' });
    const data = await r.json();
    const findings = (data.findings || []).map((f) => ({
      id: f.id,
      titulo: f.titulo,
      descripcion: f.descripcion,
      estado: f.estado,
      severidad: f.severidad,
      confianza: f.confianza,
      revisado: f.goldenLabel || null,
      citas: (f.citas || []).filter((c) => c.validated).map((c) => ({ refPath: c.refPath, quote: c.quote })),
    }));
    if (findings.length) {
      await p.query(`UPDATE actas.acta_fotos SET finding_ids = $3 WHERE acta_uuid = $1 AND inspection_id = $2`,
        [u, inspectionId, findings.map((f) => f.id)]);
    }
    return res.json({
      inspection_id: inspectionId,
      status: data.status,
      ultimo_evento: (data.events || []).slice(-1)[0]?.message || null,
      findings,
    });
  } catch (e) {
    console.error('[diag-batch:estado]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── POST /api/actas/:uuid/diagnostico/review · calificar hallazgo del batch ──
async function actaReview(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'inválido' });
  const { finding_id, veredicto, motivo } = req.body || {};
  if (!UUID_RE.test(String(finding_id || ''))) return res.status(400).json({ error: 'finding_id inválido' });
  if (veredicto !== 'correcto' && veredicto !== 'incorrecto') return res.status(400).json({ error: 'veredicto debe ser correcto|incorrecto' });
  try {
    const p = getPool();
    const inspectionId = await inspeccionDelActa(p, u);
    if (!inspectionId) return res.status(404).json({ error: 'Sin diagnóstico para esta acta' });
    const { rows: [acta] } = await p.query(
      `SELECT ot, data->>'activo_id' AS activo_id,
        (SELECT coalesce(array_agg(DISTINCT fid), '{}') FROM actas.acta_fotos f, unnest(f.finding_ids) fid WHERE f.acta_uuid = $1) AS ids
       FROM actas.actas WHERE uuid = $1`, [u],
    );
    if (!acta) return res.status(404).json({ error: 'acta no existe' });

    // validar pertenencia; si está desactualizado, refrescar del motor UNA vez
    let ids = acta.ids || [];
    if (!ids.includes(finding_id)) {
      const r = await fetch(`${MOTOR_URL}/api/inspections/${inspectionId}/events`, { headers: svcHeaders() });
      if (r.ok) {
        const data = await r.json();
        ids = (data.findings || []).map((f) => f.id);
        if (ids.length) await p.query(`UPDATE actas.acta_fotos SET finding_ids = $3 WHERE acta_uuid = $1 AND inspection_id = $2`, [u, inspectionId, ids]);
      }
    }
    if (!ids.includes(finding_id)) {
      return res.status(403).json({ error: 'El hallazgo no pertenece al diagnóstico de esta acta' });
    }

    const quien = req.actor?.username || 'tecnico';
    const motivoFinal = veredicto === 'incorrecto'
      ? `[acta ${acta.ot} · ${quien}] ${String(motivo || 'sin detalle').slice(0, 800)}`
      : undefined;
    const assetId = UUID_RE.test(String(acta.activo_id || '')) ? acta.activo_id : undefined;
    const pr = await fetch(`${MOTOR_URL}/api/findings/${finding_id}/review`, {
      method: 'PATCH',
      headers: svcHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ veredicto, ...(motivoFinal ? { motivo: motivoFinal } : {}), ...(assetId ? { assetId } : {}) }),
    });
    if (!pr.ok) return res.status(502).json({ error: 'El motor no aceptó la revisión' });
    return res.json({ success: true, veredicto });
  } catch (e) {
    console.error('[diag-batch:review]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── POST /api/actas/:uuid/activo/conforme · declara el activo conforme (F6.6) ──
// El radio "Condición Operativa Final = ✅ Conforme" del acta (bloque 4.5)
// nunca salía de la BD propia del acta — el motor no tenía forma de saber que
// el técnico revisó un activo específico y lo encontró bien, así que
// `assets.currentStatus` se quedaba en 'sin_datos' para siempre (la IA solo
// genera hallazgos de INCUMPLIMIENTO; un activo sin problemas no produce
// ninguna fila). Esto cierra ese hueco: si hay un activo seleccionado y una
// inspección vinculada a esta acta, se lo dice al motor explícitamente.
async function activoConforme(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'inválido' });
  const { activoId } = req.body || {};
  if (!UUID_RE.test(String(activoId || ''))) return res.status(400).json({ error: 'activoId inválido' });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const p = getPool();
    const inspectionId = await inspeccionDelActa(p, u);
    if (!inspectionId) return res.status(404).json({ error: 'Sin diagnóstico para esta acta — dispare el análisis antes de marcar conforme' });
    const { rows: [acta] } = await p.query('SELECT ot FROM actas.actas WHERE uuid = $1', [u]);
    if (!acta) return res.status(404).json({ error: 'acta no existe' });

    const quien = req.actor?.username || 'tecnico';
    const r = await fetch(`${MOTOR_URL}/api/assets/${activoId}/conforme`, {
      method: 'POST',
      headers: svcHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        inspectionId,
        motivo: `Confirmado conforme por ${quien} en acta ${acta.ot}.`,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[activoConforme] motor respondió', r.status, t.slice(0, 200));
      return res.status(502).json({ error: 'El motor no aceptó la marca de conforme' });
    }
    const data = await r.json();
    return res.json({ success: true, currentStatus: data.currentStatus });
  } catch (e) {
    console.error('[diagnostico:activoConforme]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

module.exports = { disparar, estado, review, actaDisparar, actaEstado, actaReview, activoConforme };
