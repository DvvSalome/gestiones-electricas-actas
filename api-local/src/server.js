// ============================================================
//  Gestiones Eléctricas — API REST
//  Servidor principal Express
// ============================================================
'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDB } = require('./db/database');

const reviewsRouter = require('./routes/reviews');
const actasRouter   = require('./routes/actas');
const assetsRouter  = require('./routes/assets');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, bypass-tunnel-reminder, ngrok-skip-browser-warning');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ge-api', version: '1.0.0', time: new Date().toISOString() });
});

// ─── Rutas ────────────────────────────────────────────────
app.use('/api/reviews', reviewsRouter);
app.use('/api/actas',   actasRouter);
app.use('/api/assets',  assetsRouter);

// ─── 404 handler ──────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ─── Error handler ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// ─── Inicio ───────────────────────────────────────────────
initDB();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚡ GE API corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Reviews: http://localhost:${PORT}/api/reviews`);
  console.log(`   Actas:   http://localhost:${PORT}/api/actas`);
  console.log(`   Assets:  http://localhost:${PORT}/api/assets\n`);
});

module.exports = app;
