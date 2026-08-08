// F6.7: identidad de cliente + historial de servicios, buscable desde el
// acta en campo. Antes "Nombre del Cliente/Empresa" era texto libre puro y
// una sede se resolvía por coincidencia EXACTA de texto en el motor — la
// misma sede con mayúsculas o tildes distintas se duplicaba en silencio (ver
// POST /api/sites/merge del motor, la cura manual que ya existía para esto).
// Este archivo agrega la mitigación real: el técnico BUSCA la sede existente
// mientras escribe, en vez de escribirla de memoria y arriesgar el typo.
const { getPool } = require('../db');

const MOTOR_URL = process.env.MOTOR_URL || 'https://electroscan.gestioneselectricas.com';
const TOKEN = process.env.MOTOR_SERVICE_TOKEN || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const svcHeaders = (extra) => Object.assign({ 'x-service-token': TOKEN }, extra || {});

// ── GET /api/sedes/buscar?q=X · autocompletado de sedes existentes (proxy al motor) ──
async function buscarSedes(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ sedes: [] });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const r = await fetch(`${MOTOR_URL}/api/sites?q=${encodeURIComponent(q)}`, { headers: svcHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Motor no disponible' });
    const { sites } = await r.json();
    return res.json({ sedes: sites || [] });
  } catch (e) {
    console.error('[historial:buscarSedes]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── GET /api/sedes/:siteId/servicios-previos · servicios anteriores de esa sede ──
// Vive bajo /api/sedes/ (no /api/actas/:uuid) A PROPÓSITO: esa ruta ya existe
// y captura cualquier /api/actas/<lo-que-sea> como si fuera un uuid.
// Orden fijo: más reciente primero — es lo único que "ordenar" necesita para
// un puñado de visitas a la misma sede; no hace falta una tabla reordenable.
async function serviciosPrevios(req, res) {
  const siteId = String(req.params.siteId || '').trim();
  if (!UUID_RE.test(siteId)) return res.status(400).json({ error: 'siteId inválido' });
  try {
    const { rows } = await getPool().query(
      `SELECT uuid, ot, estado, created_at,
              data->>'servicioTipo' AS tipo_servicio,
              data->>'tecnico' AS tecnico,
              data->>'diagnostico' AS diagnostico,
              data->>'operacionFinal' AS operacion_final
       FROM actas.actas
       WHERE site_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [siteId],
    );
    return res.json({
      servicios: rows.map((r) => ({
        uuid: r.uuid,
        ot: r.ot,
        estado: r.estado,
        fecha: r.created_at,
        tipoServicio: r.tipo_servicio,
        tecnico: r.tecnico,
        diagnostico: r.diagnostico ? String(r.diagnostico).slice(0, 200) : null,
        conforme: r.operacion_final === 'si',
      })),
    });
  } catch (e) {
    console.error('[historial:serviciosPrevios]', e);
    return res.status(500).json({ error: 'No se pudo consultar el historial' });
  }
}

// ── PATCH /api/actas/:uuid/sede · vincula el acta actual a una sede (y, opcional, a un servicio anterior) ──
async function vincularSede(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'inválido' });
  const { siteId, relatedActaUuid } = req.body || {};
  if (!UUID_RE.test(String(siteId || ''))) return res.status(400).json({ error: 'siteId inválido' });
  if (relatedActaUuid && !UUID_RE.test(String(relatedActaUuid))) {
    return res.status(400).json({ error: 'relatedActaUuid inválido' });
  }
  try {
    const p = getPool();
    // el servicio "padre" debe ser de la MISMA sede — evita vincular a un
    // acta cualquiera por un uuid mal copiado.
    if (relatedActaUuid) {
      const { rows: [padre] } = await p.query('SELECT site_id FROM actas.actas WHERE uuid = $1', [relatedActaUuid]);
      if (!padre || padre.site_id !== siteId) {
        return res.status(400).json({ error: 'El servicio anterior no pertenece a esta sede' });
      }
    }
    const { rowCount } = await p.query(
      'UPDATE actas.actas SET site_id = $2, related_acta_uuid = $3 WHERE uuid = $1',
      [u, siteId, relatedActaUuid || null],
    );
    if (!rowCount) return res.status(404).json({ error: 'acta no existe' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[historial:vincularSede]', e);
    return res.status(500).json({ error: 'No se pudo vincular la sede' });
  }
}

module.exports = { buscarSedes, serviciosPrevios, vincularSede };
