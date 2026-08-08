-- F6.7: identidad de sede + historial de servicios por cliente, buscable desde
-- el acta en campo. site_id es informativo (uuid de `public.sites` del motor,
-- SIN FK — mismo patrón que acta_fotos.inspection_id: los dos códigos viven en
-- despliegues separados y no deben acoplarse a nivel de esquema) — se llena
-- cuando el técnico selecciona una sede existente del autocompletado, o queda
-- null si escribió un cliente nuevo (se resuelve más tarde, en el motor, igual
-- que hoy). related_acta_uuid SÍ es una FK real: vive en el mismo schema.
ALTER TABLE actas.actas ADD COLUMN IF NOT EXISTS site_id uuid;
ALTER TABLE actas.actas ADD COLUMN IF NOT EXISTS related_acta_uuid uuid REFERENCES actas.actas(uuid);
CREATE INDEX IF NOT EXISTS actas_site_idx ON actas.actas (site_id) WHERE site_id IS NOT NULL;
