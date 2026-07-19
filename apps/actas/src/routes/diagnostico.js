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
    const { id: inspectionId } = await r.json();
    await p.query('UPDATE actas.acta_fotos SET inspection_id = $3 WHERE acta_uuid = $1 AND slot = $2', [u, slot, inspectionId]);
    return res.json({ inspection_id: inspectionId, estado: 'analizando', nota: 'El análisis puede tardar 1-2 minutos; puede seguir llenando el acta.' });
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

module.exports = { disparar, estado };
