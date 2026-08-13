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
const actasRoute = require('./src/routes/actas');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Traefik de Coolify — para el rate-limit por IP real
// F8.2: headers de seguridad (sin dependencia helmet — estos 3 bastan aquí;
// CSP se omite a propósito: el form usa inline scripts)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
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
// F4.2: activos (hoja de vida) — selector sede+activo del bloque 01
const activosRoute = require('./src/routes/activos');
app.get('/api/activos', requireAuth, activosRoute.listar);
app.post('/api/activos', requireAuth, activosRoute.crear);
// El catálogo de tipos vive en el motor: el acta lo consulta y puede añadir.
app.get('/api/activos/tipos', requireAuth, activosRoute.tipos);
app.post('/api/activos/tipos', requireAuth, activosRoute.crearTipo);
// F3: el motor RETIE en la foto (proxy con service token — el browser nunca ve el motor)
const diagnosticoRoute = require('./src/routes/diagnostico');
app.post('/api/actas/:uuid/fotos/:slot/diagnostico', requireAuth, diagnosticoRoute.disparar);
app.get('/api/actas/:uuid/fotos/:slot/diagnostico', requireAuth, diagnosticoRoute.estado);
app.post('/api/actas/:uuid/fotos/:slot/diagnostico/review', requireAuth, diagnosticoRoute.review);
// Batch por acta: N fotos del mismo sitio → UNA inspección (una corrida, sin duplicados)
app.post('/api/actas/:uuid/diagnostico', requireAuth, diagnosticoRoute.actaDisparar);
app.get('/api/actas/:uuid/diagnostico', requireAuth, diagnosticoRoute.actaEstado);
app.post('/api/actas/:uuid/diagnostico/review', requireAuth, diagnosticoRoute.actaReview);
// F6.6: el técnico declara un activo conforme (bloque "Condición Operativa Final")
app.post('/api/actas/:uuid/activo/conforme', requireAuth, diagnosticoRoute.activoConforme);
// F6.7: identidad de sede + historial de servicios anteriores del mismo cliente
const historialRoute = require('./src/routes/historial');
app.get('/api/sedes/buscar', requireAuth, historialRoute.buscarSedes);
app.get('/api/sedes/recientes', requireAuth, historialRoute.sedesRecientes);
app.get('/api/sedes/:siteId/servicios-previos', requireAuth, historialRoute.serviciosPrevios);
app.get('/api/sedes/:siteId/hoja-vida', requireAuth, historialRoute.hojaVidaSede);
app.post('/api/sedes/:siteId/activos', requireAuth, historialRoute.anadirActivo);
app.patch('/api/actas/:uuid/sede', requireAuth, historialRoute.vincularSede);
// F8: alta de cliente con ficha de infraestructura eléctrica ("Nuevo Cliente")
app.post('/api/sedes', requireAuth, historialRoute.crearSede);
// F8: ficha del activo (identidad, SPT, rendimiento, mantenimiento) + adjuntos + OCR de placa
app.get('/api/activos/:id/ficha', requireAuth, activosRoute.obtenerFicha);
app.patch('/api/activos/:id/ficha', requireAuth, activosRoute.guardarFicha);
app.get('/api/activos/:id/adjuntos', requireAuth, activosRoute.listarAdjuntos);
app.post('/api/activos/:id/adjuntos', requireAuth, activosRoute.uploadAdjuntoMw, activosRoute.subirAdjunto);
app.post('/api/activos/ocr-placa', requireAuth, activosRoute.uploadPlacaMw, activosRoute.ocrPlaca);
app.get('/api/health', async (_req, res) => {
  res.json({ status: 'ok', service: 'ge-actas', version: '3.0.0', db: await ping(), time: new Date().toISOString() });
});

// ---- Rutas estáticas (equivalentes a los rewrites de vercel.json) ----
const WEB = path.join(__dirname, '..', '..', 'web');
app.get('/', (_req, res) => res.redirect(302, '/actas'));
app.get('/actas', (_req, res) => res.sendFile(path.join(WEB, 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(WEB, 'admin.html')));
// /js /css /images /favicon.svg y refs relativas bajo /actas/*
app.use(express.static(WEB, { index: false }));
app.use('/actas', express.static(WEB, { index: false }));

const PORT = Number(process.env.PORT || 3000);

async function main() {
  await migrate();
  app.listen(PORT, () => console.log(`[boot] ge-actas escuchando en :${PORT}`));
}

main().catch((e) => { console.error('[boot] fallo:', e.message); process.exit(1); });
