// ============================================================
//  Route: /api/actas
//  CRUD de actas técnicas de visita
// ============================================================
'use strict';

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');

// GET /api/actas
// → Lista todas las actas (sin firma en base64 para liviandad)
router.get('/', (req, res) => {
  const db = getDB();
  const { estado, tecnico, limit = 50, offset = 0 } = req.query;

  let query  = `SELECT id, ot_number, fecha, tipo_visita, cliente, tecnico, estado, created_at FROM actas WHERE 1=1`;
  const params = [];

  if (estado)  { query += ` AND estado = ?`;  params.push(estado); }
  if (tecnico) { query += ` AND tecnico LIKE ?`; params.push(`%${tecnico}%`); }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as c FROM actas`).get().c;

  res.json({ total, returned: rows.length, actas: rows });
});

// GET /api/actas/:id
// → Acta completa (incluye firma)
router.get('/:id', (req, res) => {
  const db  = getDB();
  const row = db.prepare(`SELECT * FROM actas WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Acta no encontrada' });
  res.json(row);
});

// POST /api/actas
// → Crear nueva acta
router.post('/', (req, res) => {
  const db = getDB();
  const {
    ot_number, fecha, tipo_visita, cliente, contacto = '', telefono = '',
    direccion, ciudad = '', tecnico, matricula = '',
    diagnostico, acciones, observaciones = '',
    firma_cliente = '', firmante_nombre = '', firmante_doc = '',
    calificacion = null, estado = 'borrador',
    gps_lat = null, gps_lng = null
  } = req.body;

  // Validar campos requeridos
  const required = { ot_number, fecha, tipo_visita, cliente, direccion, tecnico, diagnostico, acciones };
  const missing  = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return res.status(400).json({ error: `Campos requeridos faltantes: ${missing.join(', ')}` });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO actas (
      id, ot_number, fecha, tipo_visita, cliente, contacto, telefono,
      direccion, ciudad, tecnico, matricula, diagnostico, acciones,
      observaciones, firma_cliente, firmante_nombre, firmante_doc,
      calificacion, estado, gps_lat, gps_lng
    ) VALUES (
      @id, @ot_number, @fecha, @tipo_visita, @cliente, @contacto, @telefono,
      @direccion, @ciudad, @tecnico, @matricula, @diagnostico, @acciones,
      @observaciones, @firma_cliente, @firmante_nombre, @firmante_doc,
      @calificacion, @estado, @gps_lat, @gps_lng
    )
  `).run({
    id, ot_number, fecha, tipo_visita, cliente, contacto, telefono,
    direccion, ciudad, tecnico, matricula, diagnostico, acciones,
    observaciones, firma_cliente, firmante_nombre, firmante_doc,
    calificacion, estado, gps_lat, gps_lng
  });

  const created = db.prepare(`SELECT * FROM actas WHERE id = ?`).get(id);
  res.status(201).json({ success: true, acta: created });
});

// PATCH /api/actas/:id/status
// → Actualizar estado del acta
router.patch('/:id/status', (req, res) => {
  const db = getDB();
  const { estado } = req.body;
  const validStates = ['borrador', 'firmado', 'enviado'];

  if (!validStates.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Valores válidos: ${validStates.join(', ')}` });
  }

  const result = db.prepare(`UPDATE actas SET estado = ? WHERE id = ?`).run(estado, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Acta no encontrada' });

  res.json({ success: true, id: req.params.id, estado });
});

// PATCH /api/actas/:id/calificacion
// → Agregar calificación del cliente (1-5)
router.patch('/:id/calificacion', (req, res) => {
  const db = getDB();
  const { calificacion } = req.body;

  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: 'Calificación debe ser un entero entre 1 y 5' });
  }

  const result = db.prepare(`UPDATE actas SET calificacion = ? WHERE id = ?`).run(calificacion, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Acta no encontrada' });

  res.json({ success: true, id: req.params.id, calificacion });
});

module.exports = router;
