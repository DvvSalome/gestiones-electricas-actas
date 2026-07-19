// /api/actas — ciclo de vida del acta completa (F2).
// F2.1: POST asigna OT secuencial de servidor (atómico por tenant) y crea el
// borrador; GET /:uuid restaura. F2.2+ agregan draft/fotos/firma/pdf.
// Sin auth hasta F2.5 (⚠️ corrección del crítico: el PIN y el cierre del
// anónimo van en el MISMO deploy) — mismo rate-limit que /api/forms.
const { getPool } = require('../db');

const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) { buckets.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 }); return false; }
  b.count += 1;
  return b.count > 60; // el autosave de F2.2 pega seguido — margen mayor que forms
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k); }, 60 * 1000).unref();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function actasRoute(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const tenant = (req.query && req.query.tenant) || process.env.DEFAULT_TENANT || 'gestiones-electricas';
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';

  try {
    // ── POST /api/actas: nueva acta con OT secuencial de servidor ──
    if (req.method === 'POST' && !req.params.uuid) {
      if (rateLimited(ip)) return res.status(429).json({ error: 'Demasiadas solicitudes' });
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const { rows: [seq] } = await client.query(
          `INSERT INTO actas.ot_seq (tenant, last) VALUES ($1, 1001)
           ON CONFLICT (tenant) DO UPDATE SET last = actas.ot_seq.last + 1
           RETURNING last`, [tenant],
        );
        const ot = `OT-${seq.last}`;
        const { rows: [acta] } = await client.query(
          `INSERT INTO actas.actas (tenant, ot, data, estado)
           VALUES ($1, $2, '{}'::jsonb, 'borrador')
           RETURNING uuid, ot`, [tenant, ot],
        );
        await client.query('COMMIT');
        return res.json({ uuid: acta.uuid, ot: acta.ot });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally { client.release(); }
    }

    // ── GET /api/actas/:uuid: restaurar borrador (data + checklist + materiales + fotos meta) ──
    if (req.method === 'GET' && req.params.uuid) {
      const u = req.params.uuid;
      if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
      const p = getPool();
      const { rows: [acta] } = await p.query(
        `SELECT uuid, ot, data, estado, firma_at, created_at, updated_at
         FROM actas.actas WHERE tenant = $1 AND uuid = $2`, [tenant, u],
      );
      if (!acta) return res.status(404).json({ error: 'no existe' });
      const [{ rows: checklist }, { rows: materiales }, { rows: fotos }] = await Promise.all([
        p.query('SELECT item_id, estado FROM actas.acta_checklist WHERE acta_uuid = $1', [u]),
        p.query('SELECT descripcion, cantidad, unidad FROM actas.acta_materiales WHERE acta_uuid = $1 ORDER BY id', [u]),
        p.query('SELECT slot, mime, size_bytes, tomada_at, inspection_id, finding_ids FROM actas.acta_fotos WHERE acta_uuid = $1', [u]),
      ]);
      return res.json({ ...acta, checklist, materiales, fotos });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    console.error('[actas]', e);
    return res.status(500).json({ error: 'Error interno' });
  }
};
