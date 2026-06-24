// ============================================================
//  Route: /api/reviews
//  CRUD de revisiones de videos
// ============================================================
'use strict';

const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/database');

// GET /api/reviews
// → Lista todas las revisiones
router.get('/', (req, res) => {
  const db = getDB();
  const rows = db.prepare(`
    SELECT filename, approved, comment, reviewer, created_at, updated_at
    FROM reviews
    ORDER BY updated_at DESC
  `).all();

  res.json({
    total: rows.length,
    pendientes: rows.filter(r => r.approved === null).length,
    aprobados:  rows.filter(r => r.approved === 1).length,
    rechazados: rows.filter(r => r.approved === 0).length,
    reviews: rows.map(r => ({ ...r, approved: r.approved === null ? null : Boolean(r.approved) }))
  });
});

// GET /api/reviews/report
// → Reporte completo en JSON y Markdown
router.get('/report', (req, res) => {
  const db = getDB();
  const rows = db.prepare(`SELECT * FROM reviews ORDER BY filename`).all();

  const fmt = (r) => ({
    filename: r.filename,
    status: r.approved === null ? '⏳ Pendiente' : r.approved ? '🟢 Aprobado' : '🔴 Rechazado',
    comment: r.comment || '-',
    reviewer: r.reviewer,
    updated_at: r.updated_at
  });

  if (req.query.format === 'markdown') {
    let md = `# Reporte de Revisión de Videos — Gestiones Eléctricas\n`;
    md += `Generado: ${new Date().toLocaleString('es-CO')}\n\n`;
    md += `| Video | Estado | Comentario | Revisor |\n`;
    md += `| :--- | :---: | :--- | :--- |\n`;
    rows.forEach(r => {
      const f = fmt(r);
      md += `| \`${f.filename}\` | ${f.status} | ${f.comment} | ${f.reviewer} |\n`;
    });
    res.type('text/plain').send(md);
  } else {
    res.json({ generated_at: new Date().toISOString(), total: rows.length, items: rows.map(fmt) });
  }
});

// GET /api/reviews/:filename
// → Revisión de un video específico
router.get('/:filename', (req, res) => {
  const db  = getDB();
  const row = db.prepare(`SELECT * FROM reviews WHERE filename = ?`).get(req.params.filename);
  if (!row) return res.status(404).json({ error: `Sin revisión para "${req.params.filename}"` });
  res.json({ ...row, approved: row.approved === null ? null : Boolean(row.approved) });
});

// POST /api/reviews/:filename
// → Crear o actualizar revisión
router.post('/:filename', (req, res) => {
  const db       = getDB();
  const filename = req.params.filename;
  const { approved, comment = '', reviewer = 'compañero' } = req.body;

  if (typeof approved !== 'boolean' && approved !== null) {
    return res.status(400).json({ error: '"approved" debe ser true, false o null' });
  }

  db.prepare(`
    INSERT INTO reviews (filename, approved, comment, reviewer)
    VALUES (@filename, @approved, @comment, @reviewer)
    ON CONFLICT(filename) DO UPDATE SET
      approved = excluded.approved,
      comment  = excluded.comment,
      reviewer = excluded.reviewer
  `).run({ filename, approved: approved === null ? null : (approved ? 1 : 0), comment, reviewer });

  const updated = db.prepare(`SELECT * FROM reviews WHERE filename = ?`).get(filename);
  res.json({ success: true, review: { ...updated, approved: updated.approved === null ? null : Boolean(updated.approved) } });
});

// DELETE /api/reviews/:filename
// → Borrar revisión
router.delete('/:filename', (req, res) => {
  const db     = getDB();
  const result = db.prepare(`DELETE FROM reviews WHERE filename = ?`).run(req.params.filename);
  if (result.changes === 0) return res.status(404).json({ error: 'Revisión no encontrada' });
  res.json({ success: true, deleted: req.params.filename });
});

module.exports = router;
