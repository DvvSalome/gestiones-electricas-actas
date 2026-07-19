// /api/reviews — revisiones de anuncios (/publicidad), contra actas.reviews.
// ⚠️ Corrección del crítico: el POST era escritura PÚBLICA en Vercel — aquí exige
// sesión del panel (flujo interno de revisión). El GET sigue público (solo lectura
// de aprobaciones, lo consume la página de revisión).
const { getPool } = require('../db');
const { verifyToken, tokenFromReq } = require('../session');

module.exports = async function reviewsRoute(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const tenant = (req.query && req.query.tenant) || process.env.DEFAULT_TENANT || 'gestiones-electricas';

  try {
    if (req.method === 'GET') {
      const { rows } = await getPool().query(
        'SELECT filename, approved, comment, reviewer, created_at, updated_at FROM actas.reviews WHERE tenant = $1', [tenant],
      );
      const list = rows.map((r) => ({
        filename: r.filename,
        approved: r.approved ?? null,
        comment: r.comment,
        reviewer: r.reviewer,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      return res.json({
        total: list.length,
        pendientes: list.filter((r) => r.approved === null).length,
        aprobados: list.filter((r) => r.approved === 1).length,
        rechazados: list.filter((r) => r.approved === 0).length,
        ajustes: list.filter((r) => r.approved === 2).length,
        reviews: list,
      });
    }

    if (req.method === 'POST') {
      if (!verifyToken(tokenFromReq(req) || (req.body && req.body.token))) {
        return res.status(401).json({ error: 'No autorizado. Inicie sesión en el panel.' });
      }
      const { filename, approved, comment = '', reviewer = 'compañero' } = req.body || {};
      if (!filename || typeof filename !== 'string' || filename.length > 200) {
        return res.status(400).json({ error: '"filename" es requerido en el body' });
      }
      let dbApproved = null;
      if (approved === true || approved === 1) dbApproved = 1;
      else if (approved === false || approved === 0) dbApproved = 0;
      else if (approved === 2) dbApproved = 2;

      const now = new Date().toLocaleString('es-CO');
      const { rows } = await getPool().query(
        `INSERT INTO actas.reviews (tenant, filename, approved, comment, reviewer, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (tenant, filename)
         DO UPDATE SET approved = EXCLUDED.approved, comment = EXCLUDED.comment,
                       reviewer = EXCLUDED.reviewer, updated_at = EXCLUDED.updated_at
         RETURNING filename, approved, comment, reviewer, created_at, updated_at`,
        [tenant, filename, dbApproved, String(comment).slice(0, 2000), String(reviewer).slice(0, 80), now],
      );
      return res.json({ success: true, review: { ...rows[0], tenant } });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    console.error('[reviews]', e);
    return res.status(500).json({ error: 'Error interno' });
  }
};
