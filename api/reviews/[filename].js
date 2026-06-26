// ============================================================
//  Vercel Serverless — /api/reviews/[filename]
//  POST /api/reviews/:filename?tenant=X  → Guardar/actualizar review
//  GET  /api/reviews/:filename?tenant=X  → Ver review individual
// ============================================================
const { put, list } = require('@vercel/blob');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, bypass-tunnel-reminder',
};

function blobKey(tenant) {
  return `reviews/${tenant}.json`;
}

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

async function saveReviews(tenant, reviews) {
  await put(blobKey(tenant), JSON.stringify(reviews), {
    access: 'public',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

module.exports = async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tenant = req.query.tenant || 'gestiones-electricas';
  const filename = req.query.filename;

  if (!filename) {
    return res.status(400).json({ error: 'filename is required' });
  }

  // ── GET: Individual review ──
  if (req.method === 'GET') {
    const reviews = await getReviews(tenant);
    const review = reviews[filename];
    if (!review) return res.status(404).json({ error: `Sin revisión para "${filename}"` });
    return res.json({ filename, ...review, tenant });
  }

  // ── POST: Save/update review ──
  if (req.method === 'POST') {
    const { approved, comment = '', reviewer = 'compañero' } = req.body || {};

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
      review: { filename, ...reviews[filename], tenant },
    });
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const reviews = await getReviews(tenant);
    if (!reviews[filename]) return res.status(404).json({ error: 'Revisión no encontrada' });
    delete reviews[filename];
    await saveReviews(tenant, reviews);
    return res.json({ success: true, deleted: filename, tenant });
  }

  res.status(405).json({ error: 'Método no permitido' });
};
