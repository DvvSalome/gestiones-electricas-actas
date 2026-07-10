const { put, list } = require('@vercel/blob');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Clave del blob por "tenant" (cliente). Compartida con el proyecto ge-plataforma.
function blobKey(tenant) {
  return `forms/${tenant}.json`;
}

async function getForms(tenant) {
  try {
    const { blobs } = await list({ prefix: blobKey(tenant), token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blobs.length === 0) return [];
    const res = await fetch(blobs[0].url + '?t=' + Date.now()); // evitar caché del blob
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
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

module.exports = async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tenant = (req.query && req.query.tenant) || 'gestiones-electricas';

  // ── GET: listar actas (más recientes primero) ──
  if (req.method === 'GET') {
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
