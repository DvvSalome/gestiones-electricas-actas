// ============================================================
//  Vercel Serverless — /api/reviews
//  GET  /api/reviews?tenant=X       → Lista reviews
//  POST /api/reviews?tenant=X       → Guardar review (body: {filename, approved, comment})
// ============================================================
const { put, list } = require('@vercel/blob');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, bypass-tunnel-reminder',
};

// Blob key for a tenant's reviews
function blobKey(tenant) {
  return `reviews/${tenant}.json`;
}

// Read all reviews for a tenant from Blob
async function getReviews(tenant) {
  try {
    const { blobs } = await list({ prefix: blobKey(tenant), token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blobs.length === 0) return {};
    
    const res = await fetch(blobs[0].url);
    if (!res.ok) return {};
    return await res.json();
  } catch (e) {
    console.error('[getReviews]', e);
    return {};
  }
}

// Write all reviews for a tenant to Blob
async function saveReviews(tenant, reviews) {
  await put(blobKey(tenant), JSON.stringify(reviews), {
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

  // ── GET: List reviews ──
  if (req.method === 'GET') {
    const reviews = await getReviews(tenant);
    const rows = Object.entries(reviews).map(([filename, data]) => ({
      filename,
      approved: data.approved ?? null,
      comment: data.comment || '',
      reviewer: data.reviewer || 'compañero',
      created_at: data.created_at || '',
      updated_at: data.updated_at || '',
      tenant,
    }));

    return res.json({
      total: rows.length,
      pendientes: rows.filter(r => r.approved === null).length,
      aprobados: rows.filter(r => r.approved === 1).length,
      rechazados: rows.filter(r => r.approved === 0).length,
      ajustes: rows.filter(r => r.approved === 2).length,
      reviews: rows,
    });
  }

  // ── POST: Save a review ──
  if (req.method === 'POST') {
    const { filename, approved, comment = '', reviewer = 'compañero' } = req.body || {};
    
    if (!filename) {
      return res.status(400).json({ error: '"filename" es requerido en el body' });
    }

    // Normalize approved value
    let dbApproved = null;
    if (approved === true || approved === 1) dbApproved = 1;
    else if (approved === false || approved === 0) dbApproved = 0;
    else if (approved === 2) dbApproved = 2;

    const reviews = await getReviews(tenant);
    const now = new Date().toLocaleString('es-CO');
    
    reviews[filename] = {
      approved: dbApproved,
      comment,
      reviewer,
      created_at: reviews[filename]?.created_at || now,
      updated_at: now,
    };

    await saveReviews(tenant, reviews);

    return res.json({
      success: true,
      review: {
        filename,
        ...reviews[filename],
        tenant,
      },
    });
  }

  res.status(405).json({ error: 'Método no permitido' });
};
