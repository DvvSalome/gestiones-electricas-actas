-- F2.1: el acta deja de ser un resumen — persistencia completa por acta.
-- Esquema inspirado en api-local (que ya lo tenía más rico) + vínculos al motor (F3).

-- identidad estable + ciclo de vida
ALTER TABLE actas.actas ADD COLUMN IF NOT EXISTS uuid uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE actas.actas ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'borrador'; -- borrador|firmada|enviada|cerrada
ALTER TABLE actas.actas ADD COLUMN IF NOT EXISTS firma_path text;      -- F2.3
ALTER TABLE actas.actas ADD COLUMN IF NOT EXISTS firma_at timestamptz; -- F2.3
ALTER TABLE actas.actas ADD COLUMN IF NOT EXISTS pdf_path text;        -- F2.3
CREATE UNIQUE INDEX IF NOT EXISTS actas_uuid_uq ON actas.actas (uuid);

-- OT secuencial de servidor por tenant (mata el aleatorio del cliente y sus colisiones).
-- Arranca en 1000 para no chocar visualmente con los OT-1000..9999 históricos: el
-- seed de F1.3 puede subir `last` por encima del máximo histórico antes del cutover.
CREATE TABLE IF NOT EXISTS actas.ot_seq (
  tenant text PRIMARY KEY,
  last   bigint NOT NULL DEFAULT 1000
);

-- fotos por slot (antes|despues|detalle|adicional|extra-N) — F2.2 las llena.
-- inspection_id / finding_ids = vínculo al motor RETIE (⚠️ corrección del crítico:
-- inspección-por-DIAGNÓSTICO vive AQUÍ, en la foto, nunca en la cabecera del acta).
CREATE TABLE IF NOT EXISTS actas.acta_fotos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_uuid     uuid NOT NULL REFERENCES actas.actas(uuid) ON DELETE CASCADE,
  slot          text NOT NULL,
  path          text NOT NULL,
  mime          text,
  size_bytes    bigint,
  tomada_at     timestamptz NOT NULL DEFAULT now(),
  gps           text,
  inspection_id uuid,
  finding_ids   uuid[] NOT NULL DEFAULT '{}',
  UNIQUE (acta_uuid, slot)
);
CREATE INDEX IF NOT EXISTS acta_fotos_acta_idx ON actas.acta_fotos (acta_uuid);

-- checklist por ítem (8 ítems del form; estado tal cual lo maneja el cliente)
CREATE TABLE IF NOT EXISTS actas.acta_checklist (
  acta_uuid uuid NOT NULL REFERENCES actas.actas(uuid) ON DELETE CASCADE,
  item_id   text NOT NULL,
  estado    text NOT NULL DEFAULT '',
  PRIMARY KEY (acta_uuid, item_id)
);

-- materiales utilizados
CREATE TABLE IF NOT EXISTS actas.acta_materiales (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  acta_uuid   uuid NOT NULL REFERENCES actas.actas(uuid) ON DELETE CASCADE,
  descripcion text NOT NULL,
  cantidad    text,
  unidad      text
);
CREATE INDEX IF NOT EXISTS acta_materiales_acta_idx ON actas.acta_materiales (acta_uuid);
