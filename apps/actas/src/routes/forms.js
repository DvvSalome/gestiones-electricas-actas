// /api/forms — mismo contrato del deploy Vercel, contra actas.actas.
// ⚠️ F1 (corrección del crítico): el POST QUEDA SIN AUTH — los técnicos no tienen
// credencial hasta el PIN de F2 y cerrar esto antes dejaría al panel ciego una
// semana. Mitigación F1: rate-limit por IP + validación de payload + límite de
// tamaño (el body llega ya capado por express.json). El cierre real va en F2.5
// EN EL MISMO deploy que el PIN.
const { getPool } = require('../db');
const { verifyToken, tokenFromReq } = require('../session');

// rate-limit en memoria: 30 escrituras / 5 min por IP (suficiente para técnicos
// reales — un acta genera 1-2 POST; frena scripts de abuso).
const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) { buckets.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 }); return false; }
  b.count += 1;
  return b.count > 30;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k); }, 60 * 1000).unref();

function rowToForm(row) {
  const f = { ...row.data, created_at: row.created_at };
  if (row.updated_at) f.updated_at = row.updated_at;
  return f;
}

module.exports = async function formsRoute(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const tenant = (req.query && req.query.tenant) || process.env.DEFAULT_TENANT || 'gestiones-electricas';

  try {
    // ── GET: listar actas (solo con sesión de admin, igual que hoy) ──
    if (req.method === 'GET') {
      if (!verifyToken(tokenFromReq(req))) {
        return res.status(401).json({ error: 'No autorizado. Inicie sesión en el panel.' });
      }
      const { rows } = await getPool().query(
        'SELECT data, created_at, updated_at FROM actas.actas WHERE tenant = $1 ORDER BY created_at DESC', [tenant],
      );
      const forms = rows.map(rowToForm);
      return res.json({ total: forms.length, forms });
    }

    // ── POST: guardar/actualizar un acta por OT (upsert atómico — fin del last-write-wins) ──
    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
      if (rateLimited(ip)) return res.status(429).json({ error: 'Demasiadas solicitudes, intente en unos minutos' });

      const formData = req.body || {};
      const ot = formData.ot;
      if (!ot || typeof ot !== 'string' || ot.length < 3 || ot.length > 40) {
        return res.status(400).json({ error: '"ot" es requerido en el body' });
      }
      // saneo mínimo: solo objetos planos de texto/número/bool (el resumen actual)
      if (typeof formData !== 'object' || Array.isArray(formData)) {
        return res.status(400).json({ error: 'payload inválido' });
      }

      const { rows } = await getPool().query(
        `INSERT INTO actas.actas (tenant, ot, data)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant, ot)
         DO UPDATE SET data = EXCLUDED.data, updated_at = now()
         RETURNING data, created_at, updated_at`,
        [tenant, ot, JSON.stringify(formData)],
      );
      return res.json({ success: true, form: rowToForm(rows[0]) });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    console.error('[forms]', e);
    return res.status(500).json({ error: 'Error interno' });
  }
};
