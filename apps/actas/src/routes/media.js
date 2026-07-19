// /api/media — proxy de Supabase Storage (bucket publicidad) con soporte Range.
// Port 1:1 del serverless de Vercel (evita bloqueo por ad blockers).
const https = require('https');

const SUPABASE_URL = 'https://aoglarmebyimcygdrnxo.supabase.co';
const BUCKET = 'publicidad';

module.exports = function mediaRoute(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path param' });
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const upstreamUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  const upstreamReq = https.get(upstreamUrl, { headers }, (upstreamRes) => {
    res.status(upstreamRes.statusCode);
    const passHeaders = ['content-type', 'content-length', 'content-range',
      'accept-ranges', 'cache-control', 'last-modified', 'etag'];
    for (const h of passHeaders) {
      if (upstreamRes.headers[h]) res.setHeader(h, upstreamRes.headers[h]);
    }
    res.setHeader('cache-control', 'public, max-age=86400');
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    res.status(502).json({ error: 'Upstream error', detail: err.message });
  });
};
