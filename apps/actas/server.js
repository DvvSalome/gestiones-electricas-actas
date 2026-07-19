// Acta Digital — Gestiones Eléctricas · servidor Express para VPS Coolify.
// Reemplaza el deploy Vercel (5 serverless functions + rewrites) con paridad
// de contratos: el frontend (web/) no cambia ni una línea.
const path = require('path');
const express = require('express');
const { migrate, ping } = require('./src/db');

// SESSION_SECRET se valida al arrancar (fail-fast, sin fallback inseguro).
require('./src/session');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  console.error('[boot] SESSION_SECRET no configurada (mínimo 16 chars) — abortando');
  process.exit(1);
}

const authRoute = require('./src/routes/auth');
const formsRoute = require('./src/routes/forms');
const reviewsRoute = require('./src/routes/reviews');
const mediaRoute = require('./src/routes/media');
const actasRoute = require('./src/routes/actas');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Traefik de Coolify — para el rate-limit por IP real
app.use(express.json({ limit: '256kb' })); // el resumen de acta es pequeño; F2 usa multipart para fotos

// CORS igual que Vercel (F2 lo cierra al dominio junto con el PIN)
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, bypass-tunnel-reminder');
  next();
});

// ---- API (mismos contratos que las functions de Vercel) ----
app.all('/api/auth', authRoute);
app.all('/api/forms', formsRoute);
app.all('/api/reviews', reviewsRoute);
app.get('/api/media', mediaRoute);
// acta completa (F2): OT de servidor + borrador restaurable + autosave + fotos originales
app.all('/api/actas', actasRoute.crear);
app.get('/api/actas/:uuid', actasRoute.obtener);
app.put('/api/actas/:uuid/draft', actasRoute.draft);
app.post('/api/actas/:uuid/fotos', actasRoute.uploadMw, actasRoute.fotoSubir);
app.get('/api/actas/:uuid/fotos/:slot', actasRoute.fotoVer);
app.delete('/api/actas/:uuid/fotos/:slot', actasRoute.fotoBorrar);
app.post('/api/actas/:uuid/firma', express.json({ limit: '1mb' }), actasRoute.firma);
app.get('/api/actas/:uuid/firma', actasRoute.firmaVer);
app.post('/api/actas/:uuid/pdf', actasRoute.uploadPdfMw, actasRoute.pdfSubir);
app.get('/api/actas/:uuid/pdf', actasRoute.pdfVer);
app.get('/api/health', async (_req, res) => {
  res.json({ status: 'ok', service: 'ge-actas', version: '3.0.0', db: await ping(), time: new Date().toISOString() });
});

// ---- Rutas estáticas (equivalentes a los rewrites de vercel.json) ----
const WEB = path.join(__dirname, '..', '..', 'web');
app.get('/', (_req, res) => res.redirect(302, '/publicidad'));
app.get('/actas', (_req, res) => res.sendFile(path.join(WEB, 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(WEB, 'admin.html')));
app.get('/publicidad', (_req, res) => res.sendFile(path.join(WEB, 'publicidad', 'index.html')));
// /js /css /images /favicon.svg /publicidad/* y refs relativas bajo /actas/*
app.use(express.static(WEB, { index: false }));
app.use('/actas', express.static(WEB, { index: false }));

const PORT = Number(process.env.PORT || 3000);

async function main() {
  await migrate();
  app.listen(PORT, () => console.log(`[boot] ge-actas escuchando en :${PORT}`));
}

main().catch((e) => { console.error('[boot] fallo:', e.message); process.exit(1); });
