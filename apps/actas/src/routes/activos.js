// F4.2: activos (hoja de vida) — proxy al motor con el service token.
// El browser nunca ve el motor; la sede se resuelve por el nombre canónico
// del cliente (mismo criterio que el diagnóstico F3).
const MOTOR_URL = process.env.MOTOR_URL || 'https://electroscan.gestioneselectricas.com';
const TOKEN = process.env.MOTOR_SERVICE_TOKEN || '';
const TIPOS = ['tablero', 'acometida', 'transformador', 'spt', 'general'];

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
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: `tipo debe ser: ${TIPOS.join('|')}` });
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
    if (!r.ok) return res.status(502).json({ error: 'El motor no aceptó el activo' });
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

module.exports = { listar, crear };
