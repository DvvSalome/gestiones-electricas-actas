// Sesiones del panel: token HMAC-SHA256 con formato IDÉNTICO al deploy Vercel
// (payload_b64url.firma_b64url, exp 12h) para que web/js/admin.js siga funcionando
// sin cambios. Diferencia clave (F1): el secreto es SESSION_SECRET propio —
// BLOB_READ_WRITE_TOKEN deja de doblar como clave y el fallback inseguro
// 'clave-insegura-de-respaldo' desaparece (el server no arranca sin secreto).
const crypto = require('crypto');

const TTL_MS = 12 * 60 * 60 * 1000;            // admin: 12h (igual que Vercel)
const TTL_TECNICO_MS = 30 * 24 * 60 * 60 * 1000; // técnico: 30 días (sesión larga en el dispositivo de campo)

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET no configurada (mínimo 16 chars)');
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sign(payloadStr) {
  return b64url(crypto.createHmac('sha256', secret()).update(payloadStr).digest());
}
function makeToken(username, role = 'admin') {
  const ttl = role === 'tecnico' ? TTL_TECNICO_MS : TTL_MS;
  // los tokens admin viejos no llevan "r" — verifyToken los trata como admin
  const payload = b64url(JSON.stringify({ u: username, r: role, exp: Date.now() + ttl }));
  return payload + '.' + sign(payload);
}
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

function hashPw(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function safeEq(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function tokenFromReq(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

// Middleware F2.5: exige sesión válida (técnico o admin). Cierra el anónimo.
function requireAuth(req, res, next) {
  const sess = verifyToken(tokenFromReq(req));
  if (!sess) return res.status(401).json({ error: 'Sesión requerida. Ingrese con su PIN.' });
  req.actor = { username: sess.u, role: sess.r || 'admin' };
  next();
}

module.exports = { makeToken, verifyToken, hashPw, safeEq, tokenFromReq, requireAuth };
