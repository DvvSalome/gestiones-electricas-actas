const { put, list } = require('@vercel/blob');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, bypass-tunnel-reminder',
};

// Blob key for forms
function blobKey(tenant) {
  return `forms/${tenant}.json`;
}

// Read all forms from Blob
async function getForms(tenant) {
  try {
    const { blobs } = await list({ prefix: blobKey(tenant), token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blobs.length === 0) return [];
    
    const res = await fetch(blobs[0].url);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error('[getForms]', e);
    return [];
  }
}

// Write all forms to Blob
async function saveForms(tenant, formsArray) {
  await put(blobKey(tenant), JSON.stringify(formsArray), {
    access: 'public',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

module.exports = async function handler(req, res) {
  // CORS
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tenant = req.query.tenant || 'gestiones-electricas';

  // ── GET: List forms ──
  if (req.method === 'GET') {
    const forms = await getForms(tenant);
    // Sort by created_at descending (newest first)
    forms.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return res.json({
      total: forms.length,
      forms: forms,
    });
  }

  // ── POST: Save a new form ──
  if (req.method === 'POST') {
    const formData = req.body || {};
    
    if (!formData.ot) {
      return res.status(400).json({ error: '"ot" es requerido en el body' });
    }

    const forms = await getForms(tenant);
    const now = new Date().toISOString();
    
    const newRecord = {
      ...formData,
      created_at: now,
    };

    // Check if OT already exists to update it, or just push a new one
    // For traceability, it's better to update if OT exists, or just allow multiple versions?
    // Let's update by OT
    const existingIndex = forms.findIndex(f => f.ot === formData.ot);
    if (existingIndex >= 0) {
      // Preserve original created_at if updating
      newRecord.created_at = forms[existingIndex].created_at;
      newRecord.updated_at = now;
      forms[existingIndex] = newRecord;
    } else {
      forms.push(newRecord);
    }

    await saveForms(tenant, forms);

    return res.json({
      success: true,
      form: newRecord,
    });
  }

  res.status(405).json({ error: 'Método no permitido' });
};
