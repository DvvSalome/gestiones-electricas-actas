// /api/actas — ciclo de vida del acta completa (F2).
// F2.1: POST asigna OT secuencial (atómico por tenant) y crea el borrador;
//       GET /:uuid restaura.
// F2.2: PUT /:uuid/draft (autosave server) + fotos con el ARCHIVO ORIGINAL
//       (⚠️ corrección del crítico: el canvas comprimido pierde el EXIF
//       probatorio — ese queda solo para preview/PDF del cliente).
// Sin auth hasta F2.5 (⚠️ el PIN y el cierre del anónimo van en el MISMO deploy).
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { getPool } = require('../db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT_RE = /^[a-z]+(-\d+)?$/; // antes|despues|detalle|adicional|extra-N
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };

// rate-limit compartido del módulo (autosave pega seguido → margen amplio)
const buckets = new Map();
function rateLimited(ip, max = 120) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) { buckets.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 }); return false; }
  b.count += 1;
  return b.count > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k); }, 60 * 1000).unref();

const ipOf = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
const tenantOf = (req) => (req.query && req.query.tenant) || process.env.DEFAULT_TENANT || 'gestiones-electricas';

// multer: archivo ORIGINAL en memoria (≤15MB, solo imágenes) — se escribe a disco tras validar el acta
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, !!EXT[file.mimetype]),
});

// ── POST /api/actas · nueva acta con OT secuencial ──
async function crear(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const tenant = tenantOf(req);
  if (rateLimited(ipOf(req), 60)) return res.status(429).json({ error: 'Demasiadas solicitudes' });
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows: [seq] } = await client.query(
      `INSERT INTO actas.ot_seq (tenant, last) VALUES ($1, 1001)
       ON CONFLICT (tenant) DO UPDATE SET last = actas.ot_seq.last + 1
       RETURNING last`, [tenant],
    );
    const { rows: [acta] } = await client.query(
      `INSERT INTO actas.actas (tenant, ot, data, estado) VALUES ($1, $2, '{}'::jsonb, 'borrador')
       RETURNING uuid, ot`, [tenant, `OT-${seq.last}`],
    );
    await client.query('COMMIT');
    return res.json({ uuid: acta.uuid, ot: acta.ot });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[actas:crear]', e);
    return res.status(500).json({ error: 'Error interno' });
  } finally { client.release(); }
}

// ── GET /api/actas/:uuid · restaurar borrador ──
async function obtener(req, res) {
  const tenant = tenantOf(req);
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
  try {
    const p = getPool();
    const { rows: [acta] } = await p.query(
      `SELECT uuid, ot, data, estado, firma_at, created_at, updated_at, site_id
       FROM actas.actas WHERE tenant = $1 AND uuid = $2`, [tenant, u],
    );
    if (!acta) return res.status(404).json({ error: 'no existe' });
    const [{ rows: checklist }, { rows: materiales }, { rows: fotos }] = await Promise.all([
      p.query('SELECT item_id, estado FROM actas.acta_checklist WHERE acta_uuid = $1', [u]),
      p.query('SELECT descripcion, cantidad, unidad FROM actas.acta_materiales WHERE acta_uuid = $1 ORDER BY id', [u]),
      p.query('SELECT slot, mime, size_bytes, tomada_at, inspection_id, finding_ids FROM actas.acta_fotos WHERE acta_uuid = $1', [u]),
    ]);
    return res.json({ ...acta, checklist, materiales, fotos });
  } catch (e) { console.error('[actas:get]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// ── PUT /api/actas/:uuid/draft · autosave server-side ──
async function draft(req, res) {
  const tenant = tenantOf(req);
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
  if (rateLimited(ipOf(req))) return res.status(429).json({ error: 'Demasiadas solicitudes' });
  const body = req.body || {};
  const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
  const checklist = Array.isArray(body.checklist) ? body.checklist.slice(0, 20) : [];
  const materiales = Array.isArray(body.materiales) ? body.materiales.slice(0, 60) : [];
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE actas.actas SET data = $3, updated_at = now()
       WHERE tenant = $1 AND uuid = $2 AND estado IN ('borrador','firmada')`,
      [tenant, u, JSON.stringify(data)],
    );
    if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'acta no existe o ya cerrada' }); }
    await client.query('DELETE FROM actas.acta_checklist WHERE acta_uuid = $1', [u]);
    for (const c of checklist) {
      if (!c || typeof c.item_id !== 'string') continue;
      await client.query('INSERT INTO actas.acta_checklist (acta_uuid, item_id, estado) VALUES ($1, $2, $3)',
        [u, c.item_id.slice(0, 40), String(c.estado ?? '').slice(0, 20)]);
    }
    await client.query('DELETE FROM actas.acta_materiales WHERE acta_uuid = $1', [u]);
    for (const m of materiales) {
      if (!m || !m.descripcion) continue;
      await client.query('INSERT INTO actas.acta_materiales (acta_uuid, descripcion, cantidad, unidad) VALUES ($1, $2, $3, $4)',
        [u, String(m.descripcion).slice(0, 300), String(m.cantidad ?? '').slice(0, 40), String(m.unidad ?? '').slice(0, 40)]);
    }
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[actas:draft]', e);
    return res.status(500).json({ error: 'Error interno' });
  } finally { client.release(); }
}

// ── POST /api/actas/:uuid/fotos · archivo ORIGINAL (EXIF intacto) ──
async function fotoSubir(req, res) {
  const tenant = tenantOf(req);
  const u = req.params.uuid;
  const slot = String(req.body.slot || '');
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
  if (!SLOT_RE.test(slot) || slot.length > 20) return res.status(400).json({ error: 'slot inválido' });
  if (!req.file) return res.status(400).json({ error: 'falta el archivo "foto" (imagen ≤15MB)' });
  try {
    const { rowCount } = await getPool().query(
      'SELECT 1 FROM actas.actas WHERE tenant = $1 AND uuid = $2', [tenant, u],
    );
    if (!rowCount) return res.status(404).json({ error: 'acta no existe' });
    const dir = path.join(UPLOAD_DIR, 'fotos', u);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, slot + (EXT[req.file.mimetype] || '.bin'));
    fs.writeFileSync(file, req.file.buffer);
    await getPool().query(
      `INSERT INTO actas.acta_fotos (acta_uuid, slot, path, mime, size_bytes, gps)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (acta_uuid, slot)
       DO UPDATE SET path = EXCLUDED.path, mime = EXCLUDED.mime, size_bytes = EXCLUDED.size_bytes,
                     gps = EXCLUDED.gps, tomada_at = now()`,
      [u, slot, file, req.file.mimetype, req.file.size, String(req.body.gps ?? '').slice(0, 120) || null],
    );
    return res.json({ success: true, slot, size: req.file.size });
  } catch (e) { console.error('[actas:foto]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// ── GET /api/actas/:uuid/fotos/:slot · stream del original ──
async function fotoVer(req, res) {
  const u = req.params.uuid, slot = req.params.slot;
  if (!UUID_RE.test(u) || !SLOT_RE.test(slot)) return res.status(400).json({ error: 'inválido' });
  try {
    const { rows: [f] } = await getPool().query(
      'SELECT path, mime FROM actas.acta_fotos WHERE acta_uuid = $1 AND slot = $2', [u, slot],
    );
    if (!f || !fs.existsSync(f.path)) return res.status(404).json({ error: 'no existe' });
    res.setHeader('Content-Type', f.mime || 'application/octet-stream');
    fs.createReadStream(f.path).pipe(res);
  } catch (e) { console.error('[actas:fotoVer]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// ── DELETE /api/actas/:uuid/fotos/:slot ──
async function fotoBorrar(req, res) {
  const u = req.params.uuid, slot = req.params.slot;
  if (!UUID_RE.test(u) || !SLOT_RE.test(slot)) return res.status(400).json({ error: 'inválido' });
  try {
    const { rows: [f] } = await getPool().query(
      'DELETE FROM actas.acta_fotos WHERE acta_uuid = $1 AND slot = $2 RETURNING path', [u, slot],
    );
    if (f?.path) { try { fs.unlinkSync(f.path); } catch { /* ya no está */ } }
    return res.json({ success: true });
  } catch (e) { console.error('[actas:fotoDel]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// ── POST /api/actas/:uuid/firma · PNG del canvas + timestamp + gps (F2.3) ──
async function firma(req, res) {
  const tenant = tenantOf(req);
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
  if (rateLimited(ipOf(req), 30)) return res.status(429).json({ error: 'Demasiadas solicitudes' });
  const dataUrl = String(req.body?.firma || '');
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length > 700_000) return res.status(400).json({ error: 'firma inválida (PNG base64 ≤512KB)' });
  try {
    const buf = Buffer.from(m[1], 'base64');
    const dir = path.join(UPLOAD_DIR, 'firmas');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${u}.png`);
    fs.writeFileSync(file, buf);
    const { rowCount } = await getPool().query(
      `UPDATE actas.actas SET firma_path = $3, firma_at = now(),
         estado = CASE WHEN estado = 'borrador' THEN 'firmada' ELSE estado END,
         data = data || jsonb_build_object('firma_gps', $4::text)
       WHERE tenant = $1 AND uuid = $2`,
      [tenant, u, file, String(req.body?.gps ?? '').slice(0, 120)],
    );
    if (!rowCount) { try { fs.unlinkSync(file); } catch { /* nada */ } return res.status(404).json({ error: 'acta no existe' }); }
    return res.json({ success: true, firmada_at: new Date().toISOString() });
  } catch (e) { console.error('[actas:firma]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// ── GET /api/actas/:uuid/firma · stream del PNG ──
async function firmaVer(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
  try {
    const { rows: [a] } = await getPool().query('SELECT firma_path FROM actas.actas WHERE uuid = $1', [u]);
    if (!a?.firma_path || !fs.existsSync(a.firma_path)) return res.status(404).json({ error: 'sin firma' });
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(a.firma_path).pipe(res);
  } catch (e) { console.error('[actas:firmaVer]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// multer aparte para el PDF archivado (≤25MB — un acta con 10 fotos pesa)
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
});

// ── POST /api/actas/:uuid/pdf · archiva el PDF generado y marca 'enviada' (F2.3) ──
async function pdfSubir(req, res) {
  const tenant = tenantOf(req);
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
  if (!req.file) return res.status(400).json({ error: 'falta el archivo "pdf"' });
  try {
    const { rowCount } = await getPool().query('SELECT 1 FROM actas.actas WHERE tenant = $1 AND uuid = $2', [tenant, u]);
    if (!rowCount) return res.status(404).json({ error: 'acta no existe' });
    const dir = path.join(UPLOAD_DIR, 'pdf');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${u}.pdf`);
    fs.writeFileSync(file, req.file.buffer);
    await getPool().query(
      `UPDATE actas.actas SET pdf_path = $3, updated_at = now(),
         estado = CASE WHEN estado IN ('borrador','firmada') THEN 'enviada' ELSE estado END
       WHERE tenant = $1 AND uuid = $2`,
      [tenant, u, file],
    );
    return res.json({ success: true, size: req.file.size });
  } catch (e) { console.error('[actas:pdf]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// ── GET /api/actas/:uuid/pdf · stream del PDF archivado ──
async function pdfVer(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'uuid inválido' });
  try {
    const { rows: [a] } = await getPool().query('SELECT pdf_path, ot FROM actas.actas WHERE uuid = $1', [u]);
    if (!a?.pdf_path || !fs.existsSync(a.pdf_path)) return res.status(404).json({ error: 'sin pdf' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Acta_${a.ot}.pdf"`);
    fs.createReadStream(a.pdf_path).pipe(res);
  } catch (e) { console.error('[actas:pdfVer]', e); return res.status(500).json({ error: 'Error interno' }); }
}

// ── GET /api/actas-full?ot=OT-X · evidencia completa para el panel (solo admin, F2.6) ──
async function porOt(req, res) {
  if (req.actor?.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  const tenant = tenantOf(req);
  const ot = String(req.query.ot || '');
  if (!ot || ot.length > 40) return res.status(400).json({ error: 'ot requerido' });
  try {
    const p = getPool();
    const { rows: [acta] } = await p.query(
      `SELECT uuid, ot, estado, firma_path IS NOT NULL AS firma, firma_at,
              pdf_path IS NOT NULL AS pdf, created_at, updated_at
       FROM actas.actas WHERE tenant = $1 AND ot = $2`, [tenant, ot],
    );
    if (!acta) return res.status(404).json({ error: 'sin acta completa (registro pre-VPS: la evidencia quedó en el PDF original)' });
    const { rows: fotos } = await p.query(
      'SELECT slot, mime, size_bytes, tomada_at, gps FROM actas.acta_fotos WHERE acta_uuid = $1 ORDER BY tomada_at', [acta.uuid],
    );
    return res.json({ ...acta, fotos });
  } catch (e) { console.error('[actas:porOt]', e); return res.status(500).json({ error: 'Error interno' }); }
}

module.exports = {
  crear, obtener, draft, fotoSubir, fotoVer, fotoBorrar,
  firma, firmaVer, pdfSubir, pdfVer, porOt,
  uploadMw: upload.single('foto'), uploadPdfMw: uploadPdf.single('pdf'),
};
