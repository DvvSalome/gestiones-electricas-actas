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

  // ── Schema ──────────────────────────────────────────────
  db.exec(`
    -- Revisiones de videos
    CREATE TABLE IF NOT EXISTS reviews (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT    NOT NULL UNIQUE,
      approved    INTEGER,           -- 1=aprobado, 0=rechazado, NULL=pendiente
      comment     TEXT    DEFAULT '',
      reviewer    TEXT    DEFAULT 'compañero',
      created_at  TEXT    DEFAULT (datetime('now', 'localtime')),
      updated_at  TEXT    DEFAULT (datetime('now', 'localtime'))
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
