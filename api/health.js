// ============================================================
//  Vercel Serverless — GET /api/health
// ============================================================
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  res.json({
    status: 'ok',
    service: 'ge-api-serverless',
    version: '2.0.0',
    time: new Date().toISOString()
  });
};
