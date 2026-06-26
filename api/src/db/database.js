// ============================================================
//  Gestiones Eléctricas — Base de datos SQLite
//  Inicialización y acceso al DB
// ============================================================
'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_DIR  = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'ge_platform.db');

let db;

function getDB() {
  if (!db) throw new Error('DB no inicializada. Llama initDB() primero.');
  return db;
}

function initDB() {
  // Crear directorio de datos si no existe
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Migración de la tabla reviews a multitenant si es necesario
  try {
    const tableInfo = db.pragma("table_info(reviews)");
    if (tableInfo && tableInfo.length > 0) {
      const hasTenant = tableInfo.some(col => col.name === 'tenant');
      if (!hasTenant) {
        console.log('[DB] Migrando tabla "reviews" para soporte multitenant...');
        db.transaction(() => {
          db.prepare('ALTER TABLE reviews RENAME TO reviews_old').run();
          db.prepare(`
            CREATE TABLE reviews (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              tenant      TEXT    NOT NULL DEFAULT 'gestiones-electricas',
              filename    TEXT    NOT NULL,
              approved    INTEGER,
              comment     TEXT    DEFAULT '',
              reviewer    TEXT    DEFAULT 'compañero',
              created_at  TEXT    DEFAULT (datetime('now', 'localtime')),
              updated_at  TEXT    DEFAULT (datetime('now', 'localtime')),
              UNIQUE(tenant, filename)
            )
          `).run();
          db.prepare(`
            INSERT INTO reviews (filename, approved, comment, reviewer, created_at, updated_at, tenant)
            SELECT filename, approved, comment, reviewer, created_at, updated_at, 'gestiones-electricas'
            FROM reviews_old
          `).run();
          db.prepare('DROP TABLE reviews_old').run();
        })();
        console.log('[DB] Migración de "reviews" completada con éxito.');
      }
    }
  } catch (err) {
    console.error('[DB] Error durante la migración de reviews:', err.message);
  }

  // ── Schema ──────────────────────────────────────────────
  db.exec(`
    -- Revisiones de videos y fotos (multitenant)
    CREATE TABLE IF NOT EXISTS reviews (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant      TEXT    NOT NULL DEFAULT 'gestiones-electricas',
      filename    TEXT    NOT NULL,
      approved    INTEGER,           -- 1=aprobado, 0=rechazado, 2=requiere ajustes (intermedio), NULL=pendiente
      comment     TEXT    DEFAULT '',
      reviewer    TEXT    DEFAULT 'compañero',
      created_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      updated_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      UNIQUE(tenant, filename)
    );

    -- Actas técnicas de visita
    CREATE TABLE IF NOT EXISTS actas (
      id              TEXT    PRIMARY KEY,    -- UUID
      ot_number       TEXT    NOT NULL,
      fecha           TEXT    NOT NULL,
      tipo_visita     TEXT    NOT NULL,
      cliente         TEXT    NOT NULL,
      contacto        TEXT    DEFAULT '',
      telefono        TEXT    DEFAULT '',
      direccion       TEXT    NOT NULL,
      ciudad          TEXT    DEFAULT '',
      tecnico         TEXT    NOT NULL,
      matricula       TEXT    DEFAULT '',
      diagnostico     TEXT    NOT NULL,
      acciones        TEXT    NOT NULL,
      observaciones   TEXT    DEFAULT '',
      firma_cliente   TEXT    DEFAULT '',    -- base64 de la firma (canvas)
      firmante_nombre TEXT    DEFAULT '',
      firmante_doc    TEXT    DEFAULT '',
      calificacion    INTEGER DEFAULT NULL,  -- 1-5 estrellas
      estado          TEXT    DEFAULT 'borrador',  -- borrador | firmado | enviado
      gps_lat         REAL    DEFAULT NULL,
      gps_lng         REAL    DEFAULT NULL,
      created_at      TEXT    DEFAULT (datetime('now', 'localtime')),
      updated_at      TEXT    DEFAULT (datetime('now', 'localtime'))
    );

    -- Trigger para updated_at en reviews
    CREATE TRIGGER IF NOT EXISTS reviews_updated_at
      AFTER UPDATE ON reviews
      BEGIN
        UPDATE reviews SET updated_at = datetime('now', 'localtime')
        WHERE id = NEW.id;
      END;

    -- Trigger para updated_at en actas
    CREATE TRIGGER IF NOT EXISTS actas_updated_at
      AFTER UPDATE ON actas
      BEGIN
        UPDATE actas SET updated_at = datetime('now', 'localtime')
        WHERE id = NEW.id;
      END;
  `);

  console.log(`[DB] SQLite inicializado en ${DB_PATH}`);
  return db;
}

module.exports = { initDB, getDB };
