// --- Sincronización con la API ---
async function saveActaToAPI() {
  const urlParams = new URLSearchParams(window.location.search);
  const apiParam = urlParams.get('api');

  let API_BASE;
  if (apiParam) {
    API_BASE = apiParam.endsWith('/') ? `${apiParam}api` : `${apiParam}/api`;
  } else {
    // La API local (puerto 3001) solo existe en desarrollo; en producción se omite
    // para evitar errores de Mixed Content en HTTPS.
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) return;
    API_BASE = `http://${window.location.hostname}:3001/api`;
  }
  const otElement = document.getElementById("header-ot");
  const otText = otElement ? otElement.textContent.replace('OT-', '') : '0000';
  const dateElement = document.getElementById("header-date");
  const cityText = dateElement ? dateElement.textContent.split(',')[0] : '';
  const gpsLatElement = document.getElementById("gps-lat");
  const gpsLngElement = document.getElementById("gps-lng");

  const data = {
    ot_number: otText,
    fecha: new Date().toISOString().split('T')[0],
    tipo_visita: document.getElementById("field-servicio-tipo").value || 'mantenimiento',
    cliente: document.getElementById("field-cliente").value || 'Cliente No Especificado',
    contacto: document.getElementById("field-firmante-nombre").value || '',
    telefono: document.getElementById("field-telefono").value || '',
    direccion: document.getElementById("field-direccion").value || 'No especificada',
    ciudad: cityText,
    tecnico: document.getElementById("field-tecnico").value || 'Técnico GE',
    matricula: document.getElementById("field-matricula").value || '',
    diagnostico: document.getElementById("field-diagnostico").value || 'Pendiente',
    acciones: document.getElementById("field-acciones").value || 'Pendiente',
    observaciones: document.getElementById("field-norma").value || '',
    firma_cliente: window.signatureDataURL || '',
    firmante_nombre: document.getElementById("field-firmante-nombre").value || '',
    firmante_doc: document.getElementById("field-firmante-documento").value || '',
    estado: 'firmado',
    gps_lat: gpsLatElement ? parseFloat(gpsLatElement.textContent) : null,
    gps_lng: gpsLngElement ? parseFloat(gpsLngElement.textContent) : null
  };

  try {
    await fetch(`${API_BASE}/actas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log("Acta guardada exitosamente en la plataforma.");
  } catch (e) {
    console.error("Error guardando acta en la API", e);
  }
}
