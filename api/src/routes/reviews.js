// ============================================================
//  Route: /api/reviews
//  CRUD de revisiones de videos e imágenes (Multitenant)
// ============================================================
'use strict';

const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/database');

// GET /api/reviews
// → Lista todas las revisiones del tenant especificado
router.get('/', (req, res) => {
  const db = getDB();
  const tenant = req.query.tenant || 'gestiones-electricas';
  const rows = db.prepare(`
    SELECT filename, approved, comment, reviewer, created_at, updated_at, tenant
    FROM reviews
    WHERE tenant = ?
    ORDER BY updated_at DESC
  `).all(tenant);

  res.json({
    total: rows.length,
    pendientes: rows.filter(r => r.approved === null).length,
    aprobados:  rows.filter(r => r.approved === 1).length,
    rechazados: rows.filter(r => r.approved === 0).length,
    ajustes:    rows.filter(r => r.approved === 2).length,
    reviews: rows
  });
});

// GET /api/reviews/report
// → Reporte completo en JSON y Markdown filtrado por tenant
router.get('/report', (req, res) => {
  const db = getDB();
  const tenant = req.query.tenant || 'gestiones-electricas';
  const rows = db.prepare(`SELECT * FROM reviews WHERE tenant = ? ORDER BY filename`).all(tenant);

  const fmt = (r) => ({
    filename: r.filename,
    status: r.approved === null ? '⏳ Pendiente' : r.approved === 1 ? '🟢 Aprobado' : r.approved === 2 ? '⚠️ Requiere Ajustes' : '🔴 Rechazado',
    comment: r.comment || '-',
    reviewer: r.reviewer,
    updated_at: r.updated_at
  });

  if (req.query.format === 'markdown') {
    let md = `# Reporte de Revisión [Cliente: ${tenant}] — Gestiones Eléctricas\n`;
    md += `Generado: ${new Date().toLocaleString('es-CO')}\n\n`;
    md += `| Video / Imagen | Estado | Comentario | Revisor | Fecha/Hora |\n`;
    md += `| :--- | :---: | :--- | :--- | :--- |\n`;
    rows.forEach(r => {
      const f = fmt(r);
      md += `| \`${f.filename}\` | ${f.status} | ${f.comment} | ${f.reviewer} | ${f.updated_at} |\n`;
    });
    res.type('text/plain').send(md);
  } else {
    res.json({ generated_at: new Date().toISOString(), tenant, total: rows.length, items: rows.map(fmt) });
  }
});

// GET /api/reviews/:filename
// → Revisión de un video/imagen específico dentro del tenant
router.get('/:filename', (req, res) => {
  const db  = getDB();
  const tenant = req.query.tenant || 'gestiones-electricas';
  const row = db.prepare(`SELECT * FROM reviews WHERE tenant = ? AND filename = ?`).get(tenant, req.params.filename);
  if (!row) return res.status(404).json({ error: `Sin revisión para "${req.params.filename}" en tenant "${tenant}"` });
  res.json(row);
});

// POST /api/reviews/:filename
// → Crear o actualizar revisión en el tenant
router.post('/:filename', (req, res) => {
  const db       = getDB();
  const filename = req.params.filename;
  const tenant   = req.query.tenant || req.body.tenant || 'gestiones-electricas';
  const { approved, comment = '', reviewer = 'compañero' } = req.body;

  // Aceptar: boolean, null o número (1, 0, 2)
  let dbApproved = null;
  if (approved === true || approved === 1) dbApproved = 1;
  else if (approved === false || approved === 0) dbApproved = 0;
  else if (approved === 2) dbApproved = 2;
  else if (approved !== null) {
    return res.status(400).json({ error: '"approved" debe ser 1 (Aprobado), 0 (Rechazado), 2 (Ajustes) o null' });
  }

  db.prepare(`
    INSERT INTO reviews (tenant, filename, approved, comment, reviewer)
    VALUES (@tenant, @filename, @approved, @comment, @reviewer)
    ON CONFLICT(tenant, filename) DO UPDATE SET
      approved = excluded.approved,
      comment  = excluded.comment,
      reviewer = excluded.reviewer,
      updated_at = datetime('now', 'localtime')
  `).run({ tenant, filename, approved: dbApproved, comment, reviewer });

  const updated = db.prepare(`SELECT * FROM reviews WHERE tenant = ? AND filename = ?`).get(tenant, filename);
  res.json({ success: true, review: updated });
});

// DELETE /api/reviews/:filename
// → Borrar revisión
router.delete('/:filename', (req, res) => {
  const db     = getDB();
  const tenant = req.query.tenant || 'gestiones-electricas';
  const result = db.prepare(`DELETE FROM reviews WHERE tenant = ? AND filename = ?`).run(tenant, req.params.filename);
  if (result.changes === 0) return res.status(404).json({ error: `Revisión no encontrada en tenant "${tenant}"` });
  res.json({ success: true, deleted: req.params.filename, tenant });
});

module.exports = router;
