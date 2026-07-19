// Autenticación del panel de administración (server-side).
// - Usuarios/hashes viven en Vercel Blob (admin_auth/<tenant>.json).
// - Contraseñas: scrypt + salt aleatoria (nunca en texto plano).
// - Sesión: token firmado con HMAC-SHA256 usando BLOB_READ_WRITE_TOKEN como
//   clave (secreto que solo existe en el servidor); expira a las 12 h.
const { put, list, del } = require('@vercel/blob');
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

// Prefijo que agrupa todas las versiones del blob de usuarios de un tenant.
// Cada guardado escribe un blob NUEVO con sufijo aleatorio (URL única); así las
// lecturas nunca traen una versión cacheada por el CDN. Al leer se toma la más
// reciente; al guardar se borran las versiones anteriores.
function usersPrefix(tenant) { return `admin_auth/${tenant}`; }

async function getUsers(tenant) {
  try {
    const { blobs } = await list({ prefix: usersPrefix(tenant), token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!blobs.length) return { users: [], _prev: [] };
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    const data = res.ok ? await res.json() : { users: [] };
    data._prev = blobs.map(b => b.url); // versiones existentes al leer (a borrar en el save)
    return data;
  } catch (e) { console.error('[getUsers]', e); return { users: [], _prev: [] }; }
}

async function saveUsers(tenant, data) {
  const prev = data._prev || [];
  await put(`admin_auth/${tenant}.json`, JSON.stringify({ users: data.users || [] }), {
    access: 'public', addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  // Borrar las versiones anteriores (incluida la que acabamos de reemplazar).
  for (const url of prev) { try { await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch (e) { /* ya borrada */ } }
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

  // Listar usuarios (solo nombres, nunca hashes) — requiere sesión
  if (action === 'list-users') {
    if (!verifyToken(body.token)) return res.status(401).json({ error: 'Sesión inválida o expirada' });
    const data = await getUsers(tenant);
    return res.json({ users: (data.users || []).map(u => ({ username: u.username })) });
  }

  // Crear un nuevo usuario del panel — requiere sesión
  if (action === 'create-user') {
    if (!verifyToken(body.token)) return res.status(401).json({ error: 'Sesión inválida o expirada' });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username) return res.status(400).json({ error: 'El usuario es obligatorio' });
    if (username.length > 40) return res.status(400).json({ error: 'El usuario es demasiado largo' });
    if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    const data = await getUsers(tenant);
    if (!data.users) data.users = [];
    if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    data.users.push({ username, salt, hash: hashPw(password, salt) });
    await saveUsers(tenant, data);
    return res.json({ success: true, username });
  }

  // Eliminar un usuario — requiere sesión; no se puede borrar a sí mismo ni el último
  if (action === 'delete-user') {
    const sess = verifyToken(body.token);
    if (!sess) return res.status(401).json({ error: 'Sesión inválida o expirada' });
    const username = String(body.username || '').trim();
    const data = await getUsers(tenant);
    const users = data.users || [];
    if (users.length <= 1) return res.status(400).json({ error: 'Debe quedar al menos un usuario' });
    if (username.toLowerCase() === sess.u.toLowerCase()) return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
    const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    if (idx < 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    users.splice(idx, 1);
    data.users = users;
    await saveUsers(tenant, data);
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Acción no válida' });
};

// Exportado para que /api/forms verifique el token (mismo secreto/algoritmo).
module.exports.verifyToken = verifyToken;
