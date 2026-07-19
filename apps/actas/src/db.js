// Pool de Postgres + runner de migraciones idempotente.
// DATABASE_URL apunta al Postgres del motor (schema `actas` propio).
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no configurada');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pool;
}

// Migraciones: archivos NNN_*.sql en ./migrations, aplicados una vez y en orden.
async function migrate() {
  const p = getPool();
  await p.query(`CREATE SCHEMA IF NOT EXISTS actas;
    CREATE TABLE IF NOT EXISTS actas._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`);
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    const { rowCount } = await p.query('SELECT 1 FROM actas._migrations WHERE name = $1', [f]);
    if (rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO actas._migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`[db] migración aplicada: ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`migración ${f} falló: ${e.message}`);
    } finally {
      client.release();
    }
  }
}

async function ping() {
  try { await getPool().query('SELECT 1'); return true; } catch { return false; }
}

module.exports = { getPool, migrate, ping };
