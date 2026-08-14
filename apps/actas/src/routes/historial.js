// F6.7: identidad de cliente + historial de servicios, buscable desde el
// acta en campo. Antes "Nombre del Cliente/Empresa" era texto libre puro y
// una sede se resolvía por coincidencia EXACTA de texto en el motor — la
// misma sede con mayúsculas o tildes distintas se duplicaba en silencio (ver
// POST /api/sites/merge del motor, la cura manual que ya existía para esto).
// Este archivo agrega la mitigación real: el técnico BUSCA la sede existente
// mientras escribe, en vez de escribirla de memoria y arriesgar el typo.
const { getPool } = require('../db');

const MOTOR_URL = process.env.MOTOR_URL || 'https://electroscan.gestioneselectricas.com';
const TOKEN = process.env.MOTOR_SERVICE_TOKEN || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const svcHeaders = (extra) => Object.assign({ 'x-service-token': TOKEN }, extra || {});

// ── GET /api/sedes/buscar?q=X · autocompletado de sedes existentes (proxy al motor) ──
async function buscarSedes(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ sedes: [] });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const r = await fetch(`${MOTOR_URL}/api/sites?q=${encodeURIComponent(q)}`, { headers: svcHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Motor no disponible' });
    const { sites } = await r.json();
    return res.json({ sedes: sites || [] });
  } catch (e) {
    console.error('[historial:buscarSedes]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── GET /api/sedes/:siteId · detalle completo (nit, contacto, infraestructura) ──
// Distinto de buscarSedes: el autocompletado solo trae {id,name,city} para no
// sobrecargar cada tecla escrita. Esto se llama UNA vez, al seleccionar un
// cliente ya existente, para que el PDF pueda repoblar su ficha de
// infraestructura eléctrica aunque se haya capturado en una visita anterior.
async function obtenerSede(req, res) {
  const siteId = String(req.params.siteId || '').trim();
  if (!UUID_RE.test(siteId)) return res.status(400).json({ error: 'siteId inválido' });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const r = await fetch(`${MOTOR_URL}/api/sites/${siteId}`, { headers: svcHeaders() });
    if (r.status === 404) return res.status(404).json({ error: 'Sede no encontrada' });
    if (!r.ok) return res.status(502).json({ error: 'Motor no disponible' });
    const { site } = await r.json();
    return res.json({ sede: site });
  } catch (e) {
    console.error('[historial:obtenerSede]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── GET /api/sedes/:siteId/servicios-previos · servicios anteriores de esa sede ──
// Vive bajo /api/sedes/ (no /api/actas/:uuid) A PROPÓSITO: esa ruta ya existe
// y captura cualquier /api/actas/<lo-que-sea> como si fuera un uuid.
// Orden fijo: más reciente primero — es lo único que "ordenar" necesita para
// un puñado de visitas a la misma sede; no hace falta una tabla reordenable.
async function serviciosPrevios(req, res) {
  const siteId = String(req.params.siteId || '').trim();
  if (!UUID_RE.test(siteId)) return res.status(400).json({ error: 'siteId inválido' });
  try {
    const { rows } = await getPool().query(
      `SELECT uuid, ot, estado, created_at,
              data->>'servicioTipo' AS tipo_servicio,
              data->>'tecnico' AS tecnico,
              data->>'diagnostico' AS diagnostico,
              data->>'operacionFinal' AS operacion_final
       FROM actas.actas
       WHERE site_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [siteId],
    );
    return res.json({
      servicios: rows.map((r) => ({
        uuid: r.uuid,
        ot: r.ot,
        estado: r.estado,
        fecha: r.created_at,
        tipoServicio: r.tipo_servicio,
        tecnico: r.tecnico,
        diagnostico: r.diagnostico ? String(r.diagnostico).slice(0, 200) : null,
        conforme: r.operacion_final === 'si',
      })),
    });
  } catch (e) {
    console.error('[historial:serviciosPrevios]', e);
    return res.status(500).json({ error: 'No se pudo consultar el historial' });
  }
}

// ── PATCH /api/actas/:uuid/sede · vincula el acta actual a una sede (y, opcional, a un servicio anterior) ──
async function vincularSede(req, res) {
  const u = req.params.uuid;
  if (!UUID_RE.test(u)) return res.status(400).json({ error: 'inválido' });
  const { siteId, relatedActaUuid } = req.body || {};
  if (!UUID_RE.test(String(siteId || ''))) return res.status(400).json({ error: 'siteId inválido' });
  if (relatedActaUuid && !UUID_RE.test(String(relatedActaUuid))) {
    return res.status(400).json({ error: 'relatedActaUuid inválido' });
  }
  try {
    const p = getPool();
    // el servicio "padre" debe ser de la MISMA sede — evita vincular a un
    // acta cualquiera por un uuid mal copiado.
    if (relatedActaUuid) {
      const { rows: [padre] } = await p.query('SELECT site_id FROM actas.actas WHERE uuid = $1', [relatedActaUuid]);
      if (!padre || padre.site_id !== siteId) {
        return res.status(400).json({ error: 'El servicio anterior no pertenece a esta sede' });
      }
    }
    const { rowCount } = await p.query(
      'UPDATE actas.actas SET site_id = $2, related_acta_uuid = $3 WHERE uuid = $1',
      [u, siteId, relatedActaUuid || null],
    );
    if (!rowCount) return res.status(404).json({ error: 'acta no existe' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[historial:vincularSede]', e);
    return res.status(500).json({ error: 'No se pudo vincular la sede' });
  }
}

// ── GET /api/sedes/recientes · "Mis clientes" — todas las sedes donde este técnico
//    ya trabajó, para la galería (F6.8). Antes tenía LIMIT 10 pensado para un widget
//    de accesos rápidos; una galería de "clientes con los que he trabajado" necesita
//    el historial completo del técnico, no solo los últimos 10.
async function sedesRecientes(req, res) {
  const { verifyToken, tokenFromReq } = require('../session');
  const sess = verifyToken(tokenFromReq(req));
  if (!sess) return res.status(401).json({ error: 'No autorizado' });

  try {
    // Sin JOIN a public.sites a propósito: el rol de Postgres del acta
    // (actas_app) no tiene SELECT sobre esa tabla del Motor (solo sobre su
    // propio schema actas.*). El nombre del cliente ya vive duplicado en
    // actas.actas.data->>'cliente' (lo guarda autosave.js en cada acta), así
    // que no hace falta cruzar de schema para armar la galería.
    const { rows } = await getPool().query(
      `SELECT
         a.site_id AS id,
         MAX(a.data->>'cliente') AS name,
         COUNT(a.uuid) AS "numServicios",
         MAX(a.created_at) AS "ultimaVisita"
       FROM actas.actas a
       WHERE a.data->>'tecnico' = $1 AND a.site_id IS NOT NULL
       GROUP BY a.site_id
       ORDER BY MAX(a.created_at) DESC
       LIMIT 300`,
      [sess.u],
    );
    return res.json({ sedes: rows });
  } catch (e) {
    console.error('[historial:sedesRecientes]', e);
    return res.status(500).json({ error: 'Error al consultar sedes recientes' });
  }
}

// ── GET /api/sedes/:siteId/hoja-vida · Trae los activos del motor (public.assets) ──
async function hojaVidaSede(req, res) {
  const siteId = String(req.params.siteId || '').trim();
  if (!UUID_RE.test(siteId)) return res.status(400).json({ error: 'siteId inválido' });
  try {
    const { rows } = await getPool().query(
      `SELECT id, codigo, nombre, tipo, ubicacion, current_status, created_at
       FROM public.assets
       WHERE site_id = $1
       ORDER BY created_at DESC`,
      [siteId]
    );
    return res.json({ activos: rows });
  } catch (e) {
    console.error('[historial:hojaVida]', e);
    return res.status(500).json({ error: 'No se pudo cargar la hoja de vida' });
  }
}

// ── POST /api/sedes/:siteId/activos · Añadir activo al motor desde campo ──
async function anadirActivo(req, res) {
  const { verifyToken, tokenFromReq } = require('../session');
  const sess = verifyToken(tokenFromReq(req));
  if (!sess) return res.status(401).json({ error: 'No autorizado' });

  const siteId = String(req.params.siteId || '').trim();
  if (!UUID_RE.test(siteId)) return res.status(400).json({ error: 'siteId inválido' });

  const { codigo, nombre, tipo, ubicacion } = req.body;
  if (!codigo || !tipo) return res.status(400).json({ error: 'Código y tipo obligatorios' });

  try {
    const p = getPool();
    // 1. Obtener organizationId de la sede
    const { rows: siteRows } = await p.query('SELECT organization_id FROM public.sites WHERE id = $1', [siteId]);
    if (siteRows.length === 0) return res.status(404).json({ error: 'Sede no encontrada' });
    const orgId = siteRows[0].organization_id;

    // 2. Insertar activo
    const { rows: newAsset } = await p.query(
      `INSERT INTO public.assets (organization_id, site_id, codigo, nombre, tipo, ubicacion)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, codigo, nombre, tipo, ubicacion, current_status, created_at`,
      [orgId, siteId, codigo, nombre, tipo, ubicacion]
    );

    return res.json({ activo: newAsset[0] });
  } catch (e) {
    console.error('[historial:anadirActivo]', e);
    // Verificar si es error de duplicado (ej. código ya existe)
    if (e.code === '23505') {
      return res.status(400).json({ error: 'El código del activo ya existe en esta sede o empresa' });
    }
    return res.status(500).json({ error: 'No se pudo añadir el activo' });
  }
}

// ── POST /api/sedes · alta explícita de cliente + infraestructura eléctrica (proxy al motor) ──
// Distinto de la resolución "al vuelo" por nombre que hace POST /api/activos: aquí el
// técnico está creando el cliente a propósito desde "Nuevo Cliente", con NIT, contacto
// y toda la ficha de infraestructura (transformador/totalizador, mediciones, SPT, solar).
async function crearSede(req, res) {
  const { nombre, direccion, tipoCliente, nit, contacto, telefono, email, infraestructura } = req.body || {};
  const name = String(nombre || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const r = await fetch(`${MOTOR_URL}/api/sites`, {
      method: 'POST',
      headers: svcHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        name,
        city: 'Barranquilla',
        ...(direccion ? { address: String(direccion).slice(0, 300) } : {}),
        ...(nit ? { nit: String(nit).slice(0, 40) } : {}),
        ...(contacto ? { contactName: String(contacto).slice(0, 150) } : {}),
        ...(telefono ? { contactPhone: String(telefono).slice(0, 40) } : {}),
        ...(email ? { contactEmail: String(email).slice(0, 150) } : {}),
        ...(tipoCliente ? { tipoCliente: String(tipoCliente).slice(0, 40) } : {}),
        ...(infraestructura && typeof infraestructura === 'object' ? { infraestructura } : {}),
      }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      return res.status(r.status === 400 ? 400 : 502).json({ error: d?.error || 'El motor no aceptó el cliente', issues: d?.issues });
    }
    // portalAccess viene poblado SOLO la primera vez (la sede recién nació) —
    // ver ensurePortalAccess en portal-auth.ts del motor. Se pasa tal cual;
    // el frontend lo mete en el mismo canal que ya usa diagnostico-ui.js
    // (window.portalAccess + localStorage ge_portal_access) para que el PDF
    // final lo imprima sin necesitar lógica nueva ahí.
    return res.json({ sede: d.site, portalAccess: d.portalAccess || null });
  } catch (e) {
    console.error('[historial:crearSede]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

module.exports = { buscarSedes, obtenerSede, serviciosPrevios, vincularSede, sedesRecientes, hojaVidaSede, anadirActivo, crearSede };
