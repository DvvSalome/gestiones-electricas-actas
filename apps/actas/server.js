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

// F2.5: CORS cerrado a los orígenes propios (el form es same-origin; esto solo
// bloquea a terceros desde el browser). ALLOWED_ORIGINS extra por env (csv).
const ALLOWED = new Set([
  'https://actas.gestioneselectricas.com',
  'http://qdw6pcfrtjvaqdlb14n3g6uo.2.24.83.195.sslip.io',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, bypass-tunnel-reminder');
  next();
});

// ---- API (mismos contratos que las functions de Vercel) ----
const { requireAuth } = require('./src/session');
app.all('/api/auth', authRoute);
// ⚠️ F2.5 (corrección del crítico, cierre EN el mismo deploy del PIN):
// escribir un acta o su resumen exige sesión (técnico o admin).
app.get('/api/forms', formsRoute);            // ya exigía sesión admin adentro
app.post('/api/forms', requireAuth, formsRoute);
app.options('/api/forms', formsRoute);
app.all('/api/reviews', reviewsRoute);
app.get('/api/media', mediaRoute);
// acta completa (F2) — TODA la superficie requiere sesión
app.post('/api/actas', requireAuth, actasRoute.crear);
app.options('/api/actas', actasRoute.crear);
app.get('/api/actas-full', requireAuth, actasRoute.porOt); // evidencia por OT (panel admin)
app.get('/api/actas/:uuid', requireAuth, actasRoute.obtener);
app.put('/api/actas/:uuid/draft', requireAuth, actasRoute.draft);
app.post('/api/actas/:uuid/fotos', requireAuth, actasRoute.uploadMw, actasRoute.fotoSubir);
app.get('/api/actas/:uuid/fotos/:slot', requireAuth, actasRoute.fotoVer);
app.delete('/api/actas/:uuid/fotos/:slot', requireAuth, actasRoute.fotoBorrar);
app.post('/api/actas/:uuid/firma', requireAuth, express.json({ limit: '1mb' }), actasRoute.firma);
app.get('/api/actas/:uuid/firma', requireAuth, actasRoute.firmaVer);
app.post('/api/actas/:uuid/pdf', requireAuth, actasRoute.uploadPdfMw, actasRoute.pdfSubir);
app.get('/api/actas/:uuid/pdf', requireAuth, actasRoute.pdfVer);
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
