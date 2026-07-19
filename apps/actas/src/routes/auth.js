// /api/auth — mismo contrato action-based del deploy Vercel, contra actas.users.
const crypto = require('crypto');
const { getPool } = require('../db');
const { makeToken, verifyToken, hashPw, safeEq } = require('../session');

async function getUsers(tenant) {
  const { rows } = await getPool().query(
    'SELECT username, salt, hash FROM actas.users WHERE tenant = $1 ORDER BY id', [tenant],
  );
  return rows;
}

module.exports = async function authRoute(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tenant = (req.query && req.query.tenant) || process.env.DEFAULT_TENANT || 'gestiones-electricas';
  const body = req.body || {};
  const action = body.action || (req.method === 'GET' ? 'status' : '');

  try {
    if (action === 'status') {
      const users = await getUsers(tenant);
      return res.json({ initialized: users.length > 0 });
    }

    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });
      const users = await getUsers(tenant);
      const u = users.find((x) => x.username.toLowerCase() === String(username).toLowerCase());
      if (!u || !safeEq(hashPw(password, u.salt), u.hash)) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }
      return res.json({ token: makeToken(u.username), username: u.username });
    }

    if (action === 'change-password') {
      const { token, currentPassword, newPassword } = body;
      const sess = verifyToken(token);
      if (!sess) return res.status(401).json({ error: 'Sesión inválida o expirada' });
      if (!newPassword || String(newPassword).length < 8) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
      }
      const users = await getUsers(tenant);
      const u = users.find((x) => x.username === sess.u);
      if (!u || !safeEq(hashPw(currentPassword || '', u.salt), u.hash)) {
        return res.status(401).json({ error: 'La contraseña actual no es correcta' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      await getPool().query(
        'UPDATE actas.users SET salt = $1, hash = $2 WHERE tenant = $3 AND lower(username) = lower($4)',
        [salt, hashPw(newPassword, salt), tenant, sess.u],
      );
      return res.json({ success: true });
    }

    if (action === 'list-users') {
      if (!verifyToken(body.token)) return res.status(401).json({ error: 'Sesión inválida o expirada' });
      const users = await getUsers(tenant);
      return res.json({ users: users.map((u) => ({ username: u.username })) });
    }

    if (action === 'create-user') {
      if (!verifyToken(body.token)) return res.status(401).json({ error: 'Sesión inválida o expirada' });
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username) return res.status(400).json({ error: 'El usuario es obligatorio' });
      if (username.length > 40) return res.status(400).json({ error: 'El usuario es demasiado largo' });
      if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      const salt = crypto.randomBytes(16).toString('hex');
      try {
        await getPool().query(
          'INSERT INTO actas.users (tenant, username, salt, hash) VALUES ($1, $2, $3, $4)',
          [tenant, username, salt, hashPw(password, salt)],
        );
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
        throw e;
      }
      return res.json({ success: true, username });
    }

    if (action === 'delete-user') {
      const sess = verifyToken(body.token);
      if (!sess) return res.status(401).json({ error: 'Sesión inválida o expirada' });
      const username = String(body.username || '').trim();
      const users = await getUsers(tenant);
      if (users.length <= 1) return res.status(400).json({ error: 'Debe quedar al menos un usuario' });
      if (username.toLowerCase() === sess.u.toLowerCase()) return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
      const { rowCount } = await getPool().query(
        'DELETE FROM actas.users WHERE tenant = $1 AND lower(username) = lower($2)', [tenant, username],
      );
      if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('[auth]', e);
    return res.status(500).json({ error: 'Error interno' });
  }
};
