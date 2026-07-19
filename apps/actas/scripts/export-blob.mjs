#!/usr/bin/env node
/**
 * Export de datos del deploy Vercel → seed del Postgres del VPS (F1.2/F1.3).
 * Idempotente y re-ejecutable (upserts): se corre antes del cutover y de nuevo
 * después para arrastrar lo que entró durante el TTL del DNS.
 *
 * DOS MODOS (usa el que tengas disponible):
 *
 *  A) Modo BLOB (export completo: actas + usuarios con sus hashes):
 *     BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx DATABASE_URL=postgres://... node scripts/export-blob.mjs
 *
 *  B) Modo API (sin token de Blob; usa el deploy vivo):
 *     ACTAS_ADMIN_USER=xxx ACTAS_ADMIN_PASS=yyy DATABASE_URL=postgres://... node scripts/export-blob.mjs --api
 *     - actas: GET /api/forms con sesión admin (login real)
 *     - usuarios: NO exportable por API (los hashes no salen) → crear admin nuevo:
 *       node scripts/export-blob.mjs --create-admin usuario contraseña
 *
 * El tenant por defecto es gestiones-electricas (TENANT=x para otro).
 */
import { Pool } from 'pg';

const TENANT = process.env.TENANT || 'gestiones-electricas';
const LIVE = process.env.ACTAS_LIVE_URL || 'https://actas.gestioneselectricas.com';
const args = process.argv.slice(2);

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL requerida'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function upsertActa(form) {
  const { created_at, updated_at, ...data } = form;
  await pool.query(
    `INSERT INTO actas.actas (tenant, ot, data, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5::timestamptz)
     ON CONFLICT (tenant, ot) DO UPDATE SET data = EXCLUDED.data,
       updated_at = COALESCE(EXCLUDED.updated_at, actas.actas.updated_at)`,
    [TENANT, form.ot, JSON.stringify({ ...data, ot: form.ot }), created_at ?? null, updated_at ?? null],
  );
}

async function upsertUser(u) {
  await pool.query(
    `INSERT INTO actas.users (tenant, username, salt, hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant, lower(username)) DO UPDATE SET salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
    [TENANT, u.username, u.salt, u.hash],
  );
}

// ---- modo --create-admin: alta directa de un admin nuevo (scrypt igual al server) ----
if (args[0] === '--create-admin') {
  const [, username, password] = args;
  if (!username || !password || password.length < 8) {
    console.error('uso: --create-admin <usuario> <contraseña(≥8)>'); process.exit(1);
  }
  const { scryptSync, randomBytes } = await import('node:crypto');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  await upsertUser({ username, salt, hash });
  console.log(`admin '${username}' creado/actualizado en tenant ${TENANT}`);
  await pool.end(); process.exit(0);
}

async function main() {
  let actas = 0, users = 0;

  if (args.includes('--api')) {
    // ---- modo API: login admin + GET /api/forms ----
    const user = process.env.ACTAS_ADMIN_USER, pass = process.env.ACTAS_ADMIN_PASS;
    if (!user || !pass) {
      console.log(`Para las ACTAS en modo API faltan ACTAS_ADMIN_USER/ACTAS_ADMIN_PASS (o usa el modo BLOB con el token).`);
      await pool.end(); return;
    }
    const login = await fetch(`${LIVE}/api/auth?tenant=${TENANT}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: user, password: pass }),
    });
    if (!login.ok) { console.error(`login falló: HTTP ${login.status} ${await login.text()}`); process.exit(1); }
    const { token } = await login.json();
    const res = await fetch(`${LIVE}/api/forms?tenant=${TENANT}&t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { console.error(`GET forms falló: HTTP ${res.status}`); process.exit(1); }
    const { forms = [] } = await res.json();
    for (const f of forms) { if (f.ot) { await upsertActa(f); actas++; } }
    console.log('(usuarios no exportables por API — usar --create-admin para el admin nuevo)');
  } else {
    // ---- modo BLOB: export completo con el token ----
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) { console.error('falta BLOB_READ_WRITE_TOKEN (o usa --api)'); process.exit(1); }
    const { list } = await import('@vercel/blob');
    async function latest(prefix) {
      const { blobs } = await list({ prefix, token });
      if (!blobs.length) return null;
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const res = await fetch(blobs[0].url, { cache: 'no-store' });
      return res.ok ? res.json() : null;
    }
    const forms = (await latest(`forms/${TENANT}`)) ?? [];
    for (const f of forms) { if (f.ot) { await upsertActa(f); actas++; } }
    const auth = (await latest(`admin_auth/${TENANT}`)) ?? { users: [] };
    for (const u of auth.users ?? []) { await upsertUser(u); users++; }
  }

  console.log(`export OK — actas: ${actas} · usuarios: ${users} (tenant ${TENANT})`);
  await pool.end();
}

main().catch((e) => { console.error('export falló:', e.message); process.exit(1); });
