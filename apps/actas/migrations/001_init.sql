-- F1: paridad con el deploy Vercel — schema `actas` en el MISMO Postgres del motor
-- (decisión #3 del BACKLOG, precisada por el crítico: schemas, no databases → un pg_dump, JOINs reales).
CREATE SCHEMA IF NOT EXISTS actas;

-- Usuarios del panel /admin. Los hashes scrypt+salt se importan TAL CUAL del blob
-- admin_auth/<tenant>.json (mismo algoritmo: scrypt(password, salt, 64) hex).
CREATE TABLE IF NOT EXISTS actas.users (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant      text NOT NULL,
  username    text NOT NULL,
  salt        text NOT NULL,
  hash        text NOT NULL,
  role        text NOT NULL DEFAULT 'admin', -- F2 agrega rol 'tecnico' (PIN)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_username_uq
  ON actas.users (tenant, lower(username));

-- El resumen de acta que hoy envía saveFormDataToBackend() (JSON plano por OT).
-- El upsert por (tenant, ot) pasa a ser atómico en DB (fin del last-write-wins
-- sobre el blob único). F2 extiende esto a la persistencia completa.
CREATE TABLE IF NOT EXISTS actas.actas (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant      text NOT NULL,
  ot          text NOT NULL,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS actas_tenant_ot_uq ON actas.actas (tenant, ot);
CREATE INDEX IF NOT EXISTS actas_tenant_created_idx ON actas.actas (tenant, created_at DESC);

-- Revisiones de anuncios (página /publicidad). Una fila por archivo.
CREATE TABLE IF NOT EXISTS actas.reviews (
  tenant      text NOT NULL,
  filename    text NOT NULL,
  approved    smallint,           -- null=pendiente · 1=aprobado · 0=rechazado · 2=ajustes
  comment     text NOT NULL DEFAULT '',
  reviewer    text NOT NULL DEFAULT 'compañero',
  created_at  text NOT NULL,      -- formato es-CO legacy (se preserva el shape de la API)
  updated_at  text NOT NULL,
  PRIMARY KEY (tenant, filename)
);
