// ============================================================
//  Vercel Serverless — GET /api/media?path=tenant/filename.mp4
//  Proxy de Supabase Storage — evita bloqueo por ad blockers
// ============================================================
const https = require('https');

const SUPABASE_URL = 'https://aoglarmebyimcygdrnxo.supabase.co';
const BUCKET = 'publicidad';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path param' });

  // Sanitizar: no permitir path traversal
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const upstreamUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;

  // Pasar Range header si existe (necesario para seeking en video)
  const headers = {};
  if (req.headers['range']) headers['Range'] = req.headers['range'];

  return new Promise((resolve) => {
    const upstreamReq = https.get(upstreamUrl, { headers }, (upstreamRes) => {
      const status = upstreamRes.statusCode;
      res.status(status);

      // Pasar headers relevantes del upstream
      const passHeaders = ['content-type', 'content-length', 'content-range',
                           'accept-ranges', 'cache-control', 'last-modified', 'etag'];
      for (const h of passHeaders) {
        if (upstreamRes.headers[h]) res.setHeader(h, upstreamRes.headers[h]);
      }
      res.setHeader('cache-control', 'public, max-age=86400');

      upstreamRes.pipe(res);
      upstreamRes.on('end', resolve);
    });

    upstreamReq.on('error', (err) => {
      res.status(502).json({ error: 'Upstream error', detail: err.message });
      resolve();
    });
  });
};
