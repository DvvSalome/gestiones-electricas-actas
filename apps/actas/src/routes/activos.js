// F4.2: activos (hoja de vida) — proxy al motor con el service token.
// El browser nunca ve el motor; la sede se resuelve por el nombre canónico
// del cliente (mismo criterio que el diagnóstico F3).
const MOTOR_URL = process.env.MOTOR_URL || 'https://electroscan.gestioneselectricas.com';
const TOKEN = process.env.MOTOR_SERVICE_TOKEN || '';

// Los tipos de activo VIVEN EN EL MOTOR, no aquí.
//
// Antes esto era `const TIPOS = ['tablero','acometida',...]` y validaba contra
// esa lista. Era la segunda barrera invisible: aunque el desplegable del acta
// ofreciera un tipo nuevo, este proxy lo rechazaba con un 400 antes de llegar
// al motor. Duplicar el catálogo en dos sitios garantiza que se desincronicen.
//
// Estos cinco quedan SOLO como respaldo para cuando el motor no responde: en
// campo hay zonas sin señal y el técnico no puede quedarse sin desplegable.
const TIPOS_RESPALDO = [
  { clave: 'tablero', etiqueta: 'Tablero' },
  { clave: 'acometida', etiqueta: 'Acometida' },
  { clave: 'transformador', etiqueta: 'Transformador' },
  { clave: 'spt', etiqueta: 'SPT / Puesta a tierra' },
  { clave: 'general', etiqueta: 'General' },
];

const svcHeaders = (extra) => Object.assign({ 'x-service-token': TOKEN }, extra || {});

// ── GET /api/activos?cliente=X · activos de la sede del cliente ──
async function listar(req, res) {
  const cliente = String(req.query.cliente || '').trim().slice(0, 120);
  if (!cliente) return res.json({ activos: [] });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const r = await fetch(`${MOTOR_URL}/api/assets?siteName=${encodeURIComponent(cliente)}`, { headers: svcHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Motor no disponible' });
    const { assets } = await r.json();
    return res.json({
      activos: (assets || []).map((a) => ({
        id: a.id, codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, semaforo: a.currentStatus,
      })),
    });
  } catch (e) {
    console.error('[activos:listar]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── POST /api/activos · crear al vuelo desde el acta ──
async function crear(req, res) {
  const { cliente, codigo, tipo, nombre, ubicacion } = req.body || {};
  const c = String(cliente || '').trim().slice(0, 120);
  const cod = String(codigo || '').trim().toUpperCase().slice(0, 40);
  if (!c || !cod) return res.status(400).json({ error: 'cliente y código son obligatorios' });
  if (!tipo) return res.status(400).json({ error: 'falta el tipo de activo' });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const r = await fetch(`${MOTOR_URL}/api/assets`, {
      method: 'POST',
      headers: svcHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteName: c,
        siteCity: 'Barranquilla',
        codigo: cod,
        tipo,
        ...(nombre ? { nombre: String(nombre).slice(0, 200) } : {}),
        ...(ubicacion ? { ubicacion: String(ubicacion).slice(0, 300) } : {}),
      }),
    });
    if (!r.ok) {
      // El motor explica QUÉ pasó (tipo desconocido, código repetido...). Antes
      // se tapaba con un "no aceptó el activo" que dejaba al técnico a ciegas.
      const d = await r.json().catch(() => null);
      return res.status(r.status === 400 ? 400 : 502).json({
        error: d?.error || 'El motor no aceptó el activo',
        disponibles: d?.disponibles,
      });
    }
    const { asset, created } = await r.json();
    return res.json({
      activo: { id: asset.id, codigo: asset.codigo, nombre: asset.nombre, tipo: asset.tipo, semaforo: asset.currentStatus },
      created,
    });
  } catch (e) {
    console.error('[activos:crear]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

// ── GET /api/activos/tipos · catálogo del motor ──
async function tipos(req, res) {
  if (!TOKEN) return res.json({ tipos: TIPOS_RESPALDO, respaldo: true });
  try {
    const r = await fetch(`${MOTOR_URL}/api/activos/tipos`, { headers: svcHeaders() });
    if (!r.ok) return res.json({ tipos: TIPOS_RESPALDO, respaldo: true });
    const d = await r.json();
    return res.json({ tipos: d.tipos || TIPOS_RESPALDO, respaldo: false });
  } catch (e) {
    // Sin señal se devuelve el respaldo y se DICE que lo es, para que la
    // interfaz pueda avisar de que quizá falten tipos creados por otros.
    console.error('[activos:tipos]', e);
    return res.json({ tipos: TIPOS_RESPALDO, respaldo: true });
  }
}

// ── POST /api/activos/tipos · el técnico crea un tipo que falta ──
async function crearTipo(req, res) {
  const etiqueta = String((req.body || {}).etiqueta || '').trim().slice(0, 60);
  const prefijo = String((req.body || {}).prefijo || '').trim().toUpperCase().slice(0, 4);
  if (etiqueta.length < 3) return res.status(400).json({ error: 'El nombre del tipo es demasiado corto.' });
  if (!TOKEN) return res.status(503).json({ error: 'Motor no configurado' });
  try {
    const r = await fetch(`${MOTOR_URL}/api/activos/tipos`, {
      method: 'POST',
      headers: svcHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(Object.assign({ etiqueta }, prefijo ? { prefijo } : {})),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      // 409 = ya existe. Se devuelve el existente para que el acta lo
      // seleccione en vez de dejar al técnico atascado repitiendo el intento.
      return res.status(r.status).json({ error: d?.error || 'No se pudo crear el tipo', existente: d?.existente });
    }
    return res.json({ tipo: d.tipo });
  } catch (e) {
    console.error('[activos:crearTipo]', e);
    return res.status(502).json({ error: 'Motor no disponible' });
  }
}

module.exports = { listar, crear, tipos, crearTipo };
