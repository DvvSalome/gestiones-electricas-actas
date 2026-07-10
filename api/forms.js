const { put, list } = require('@vercel/blob');
const crypto = require('crypto');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Verificación del token de sesión (mismo secreto/algoritmo que /api/auth).
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const secret = process.env.BLOB_READ_WRITE_TOKEN || 'clave-insegura-de-respaldo';
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest()
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

function tokenFromReq(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

// Clave del blob por "tenant" (cliente). Compartida con el proyecto ge-plataforma.
function blobKey(tenant) {
  return `forms/${tenant}.json`;
}

async function getForms(tenant) {
  try {
    const { blobs } = await list({ prefix: blobKey(tenant), token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blobs.length === 0) return [];
    const res = await fetch(blobs[0].url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error('[getForms]', e);
    return [];
  }
}

async function saveForms(tenant, formsArray) {
  await put(blobKey(tenant), JSON.stringify(formsArray), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0, // sin caché en el CDN: el panel ve las actas nuevas al instante
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

module.exports = async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tenant = (req.query && req.query.tenant) || 'gestiones-electricas';

  // ── GET: listar actas (protegido: solo con sesión de admin válida) ──
  if (req.method === 'GET') {
    if (!verifyToken(tokenFromReq(req))) {
      return res.status(401).json({ error: 'No autorizado. Inicie sesión en el panel.' });
    }
    const forms = await getForms(tenant);
    forms.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json({ total: forms.length, forms });
  }

  // ── POST: guardar/actualizar un acta por OT ──
  if (req.method === 'POST') {
    const formData = req.body || {};
    if (!formData.ot) {
      return res.status(400).json({ error: '"ot" es requerido en el body' });
    }

    const forms = await getForms(tenant);
    const now = new Date().toISOString();
    const newRecord = { ...formData, created_at: now };

    const existingIndex = forms.findIndex(f => f.ot === formData.ot);
    if (existingIndex >= 0) {
      newRecord.created_at = forms[existingIndex].created_at; // preservar alta original
      newRecord.updated_at = now;
      forms[existingIndex] = newRecord;
    } else {
      forms.push(newRecord);
    }

    await saveForms(tenant, forms);
    return res.json({ success: true, form: newRecord });
  }

  res.status(405).json({ error: 'Método no permitido' });
};
