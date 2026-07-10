// Autenticación del panel de administración (server-side).
// - Usuarios/hashes viven en Vercel Blob (admin_auth/<tenant>.json).
// - Contraseñas: scrypt + salt aleatoria (nunca en texto plano).
// - Sesión: token firmado con HMAC-SHA256 usando BLOB_READ_WRITE_TOKEN como
//   clave (secreto que solo existe en el servidor); expira a las 12 h.
const { put, list } = require('@vercel/blob');
const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const secret = () => process.env.BLOB_READ_WRITE_TOKEN || 'clave-insegura-de-respaldo';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sign(payloadStr) {
  return b64url(crypto.createHmac('sha256', secret()).update(payloadStr).digest());
}
function makeToken(username) {
  const payload = b64url(JSON.stringify({ u: username, exp: Date.now() + TTL_MS }));
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

function usersKey(tenant) { return `admin_auth/${tenant}.json`; }
async function getUsers(tenant) {
  try {
    const { blobs } = await list({ prefix: usersKey(tenant), token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!blobs.length) return { users: [] };
    const res = await fetch(blobs[0].url + '?t=' + Date.now());
    if (!res.ok) return { users: [] };
    return await res.json();
  } catch (e) { console.error('[getUsers]', e); return { users: [] }; }
}
async function saveUsers(tenant, data) {
  await put(usersKey(tenant), JSON.stringify(data), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tenant = (req.query && req.query.tenant) || 'gestiones-electricas';
  const body = req.body || {};
  const action = body.action || (req.method === 'GET' ? 'status' : '');

  // ¿Ya hay una cuenta creada? (para que el panel muestre login vs. aviso)
  if (action === 'status') {
    const { users } = await getUsers(tenant);
    return res.json({ initialized: (users || []).length > 0 });
  }

  // Login → devuelve token de sesión firmado
  if (action === 'login') {
    const { username, password } = body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });
    const data = await getUsers(tenant);
    const u = (data.users || []).find(x => x.username.toLowerCase() === String(username).toLowerCase());
    if (!u || !safeEq(hashPw(password, u.salt), u.hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    return res.json({ token: makeToken(u.username), username: u.username });
  }

  // Cambio de contraseña (requiere sesión válida + contraseña actual)
  if (action === 'change-password') {
    const { token, currentPassword, newPassword } = body;
    const sess = verifyToken(token);
    if (!sess) return res.status(401).json({ error: 'Sesión inválida o expirada' });
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }
    const data = await getUsers(tenant);
    const u = (data.users || []).find(x => x.username === sess.u);
    if (!u || !safeEq(hashPw(currentPassword || '', u.salt), u.hash)) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = hashPw(newPassword, u.salt);
    await saveUsers(tenant, data);
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Acción no válida' });
};

// Exportado para que /api/forms verifique el token (mismo secreto/algoritmo).
module.exports.verifyToken = verifyToken;
