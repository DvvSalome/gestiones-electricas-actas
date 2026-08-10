/* ══════════════════════════════════════════
   VISITAS.JS - LÓGICA DE SPA Y GALERÍA
   ══════════════════════════════════════════ */

// 1. Navegación (Tabs)
window.switchTab = function(tabName) {
    // Actualizar botones
    document.getElementById('tab-acta').classList.remove('active');
    document.getElementById('tab-visitas').classList.remove('active');
    document.getElementById('tab-' + tabName).classList.add('active');

    // Actualizar vistas
    document.getElementById('view-acta').classList.remove('active');
    document.getElementById('view-visitas').classList.remove('active');
    document.getElementById('view-' + tabName).classList.add('active');
    
    // Ocultar detalle de cliente si entramos a la galería
    if(tabName === 'visitas') {
        window.cerrarDetalleCliente();
        renderGallery();
    }
};

// 2. Estado de la Galería (Dinámico)
let CLIENTES_CARGADOS = [];
let clienteSeleccionadoActual = null;

// Obtener token de la sesión activa
function getAuthToken() {
    return localStorage.getItem('ge_tecnico_token') || sessionStorage.getItem('ge_tecnico_token') || '';
}

// 3. Renderizar Galería (conectado al Backend)
window.renderGallery = async function() {
    const container = document.getElementById('gallery-container');
    if (!container) return;
    
    container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--brand-muted);">Cargando tus visitas...</div>';
    
    try {
        const token = getAuthToken();
        if (!token) throw new Error("No hay sesión activa");
        
        const res = await fetch('/api/sedes/recientes', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!res.ok) throw new Error('Error al cargar visitas');
        
        const data = await res.json();
        const sedes = data.sedes || [];
        
        if (sedes.length === 0) {
            container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--brand-muted);">No has registrado visitas recientemente.</div>';
            return;
        }
        
        // Guardamos las sedes para usarlas en el detalle
        CLIENTES_CARGADOS = sedes.map((s, idx) => ({
            id: s.site_id || 'temp-' + idx, // fallback si no hay uuid
            is_temp: !s.site_id,
            nombre: s.nombre || 'Cliente Sin Nombre',
            ciudad: s.ciudad || 'Sin ciudad',
            num_servicios: s.num_servicios || 0
        }));
        
        let html = '';
        CLIENTES_CARGADOS.forEach(cliente => {
            const inicial = cliente.nombre.charAt(0).toUpperCase();
            html += `
                <div class="gallery-card" style="flex-direction:row; justify-content:flex-start; text-align:left; gap:16px;" onclick="abrirDetalleCliente('${cliente.id}')">
                    <div class="gallery-icon" style="margin:0; flex-shrink:0;">${inicial}</div>
                    <div>
                        <h3>${cliente.nombre}</h3>
                        <p style="margin-bottom:6px;">📍 ${cliente.ciudad}</p>
                        <div class="gallery-badge" style="display:inline-block; margin:0;">${cliente.num_servicios} Servicio(s)</div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--brand-danger);">No se pudieron cargar las visitas. <button onclick="renderGallery()" class="btn btn-primary" style="margin-top:10px;">Reintentar</button></div>';
    }
};



// 4. Abrir Detalle (Hoja de Vida)
window.abrirDetalleCliente = async function(id) {
    const cliente = CLIENTES_CARGADOS.find(c => c.id === id);
    if (!cliente) return;
    
    clienteSeleccionadoActual = cliente;
    
    // Ocultar grid, mostrar detalle
    document.getElementById('pantalla-galeria').style.display = 'none';
    document.getElementById('pantalla-detalle').style.display = 'block';
    window.scrollTo(0, 0);
    
    // Llenar Header (Loading status)
    const header = document.getElementById('hdv-header');
    header.innerHTML = `
        <div style="background: linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-olive) 100%); padding: 24px; border-radius: 16px; color: white; box-shadow: 0 10px 25px rgba(0,0,0,0.1); position: relative; overflow: hidden; margin: 0 20px 20px 20px;">
            <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 8px 0; position: relative; z-index: 1;">${cliente.nombre}</h1>
            <p style="margin: 0 0 16px 0; opacity: 0.9; font-size: 14px; position: relative; z-index: 1;">📍 ${cliente.ciudad}</p>
            <div style="display: flex; gap: 12px; position: relative; z-index: 1;">
                <div style="background: rgba(255,255,255,0.15); padding: 10px 16px; border-radius: 10px; backdrop-filter: blur(5px);">
                    <div style="font-size: 22px; font-weight: 800; line-height:1;">${cliente.num_servicios}</div>
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-top:4px;">Servicios</div>
                </div>
            </div>
        </div>
    `;
    
    const list = document.getElementById('hdv-servicios');
    list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--brand-muted);">Cargando historial de servicios...</div>';
    
    let activos = [];
    let servicios = [];
    
    if (cliente.is_temp) {
       list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--brand-muted);">El cliente es nuevo y aún no tiene historial validado por el motor.</div>';
       return;
    }
    
    try {
        const token = getAuthToken();
        const [resActivos, resServicios] = await Promise.all([
            fetch(`/api/sedes/${cliente.id}/hoja-vida`, { headers: { 'Authorization': 'Bearer ' + token } }),
            fetch(`/api/sedes/${cliente.id}/servicios-previos`, { headers: { 'Authorization': 'Bearer ' + token } })
        ]);
        
        if (resActivos.ok && resServicios.ok) {
            const dataActivos = await resActivos.json();
            const dataServicios = await resServicios.json();
            activos = dataActivos.activos || [];
            servicios = dataServicios.servicios || [];
        } else {
            throw new Error('Error de red');
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--brand-danger);">No se pudo cargar el historial.</div>';
        return;
    }
    
    if (activos.length === 0) {
        list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--brand-muted);">No hay activos registrados en esta sede.</div>';
        return;
    }
    
    let sHTML = '<div style="display:flex; flex-direction:column; gap:16px; padding:0 20px 20px 20px;">';
    activos.forEach(a => {
        let isOk = false;
        let color = "var(--brand-muted)";
        let bg = "#F4F6EA";
        let estadoLabel = "Sin Datos";
        let borderBar = "#E3E6DA";
        
        if (a.current_status === 'verde') {
            isOk = true;
            color = "var(--brand-ok)";
            bg = "#EAF3DE";
            estadoLabel = "Conforme";
            borderBar = "var(--brand-lime)";
        } else if (a.current_status === 'rojo') {
            color = "var(--brand-danger)";
            bg = "#FCE8E8";
            estadoLabel = "Crítico";
            borderBar = "var(--brand-danger)";
        } else if (a.current_status === 'ambar') {
            color = "var(--brand-warn)";
            bg = "#FBEFDF";
            estadoLabel = "Riesgo";
            borderBar = "var(--brand-warn)";
        }
        
        const fecha = new Date(a.created_at).toLocaleDateString("es-CO");
        
        sHTML += `
            <div style="background: white; border-radius: 20px; padding: 24px; margin-bottom: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.06); transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); border: 1px solid rgba(0,0,0,0.02); position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: ${borderBar};"></div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 16px;">
                    <div>
                        <div style="display:inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.04); color: var(--brand-dark); font-weight: 700; font-size: 11px; padding: 6px 10px; border-radius: 8px; margin-bottom: 10px; letter-spacing: 0.5px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            ${a.codigo}
                        </div>
                        <h3 style="color: var(--brand-dark); font-size: 18px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.3px;">${a.nombre || a.tipo}</h3>
                        <div style="display:flex; flex-direction:column; gap: 6px;">
                            <div style="color: var(--brand-muted); font-size: 13px; display: flex; align-items: center; gap: 8px; font-weight: 500;">
                                <div style="background: rgba(0,0,0,0.05); padding: 4px; border-radius: 6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
                                Registrado: ${fecha} 
                            </div>
                            <div style="color: var(--brand-muted); font-size: 13px; display: flex; align-items: center; gap: 8px; font-weight: 500;">
                                <div style="background: rgba(0,0,0,0.05); padding: 4px; border-radius: 6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>
                                ${a.ubicacion || 'Ubicación no especificada'}
                            </div>
                        </div>
                    </div>
                    <div style="background: ${bg}; color: ${color}; font-size: 11px; font-weight: 800; padding: 8px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 12px ${isOk ? 'rgba(201, 228, 0, 0.2)' : 'rgba(0,0,0,0.05)'};">
                        ${estadoLabel}
                    </div>
                </div>
            </div>
        `;
    });
    sHTML += '</div>';
    
    // --- HISTORIAL DE SERVICIOS PREVIOS ---
    if (servicios.length > 0) {
        sHTML += '<h3 style="margin: 10px 20px 16px 20px; font-size: 16px; color: var(--brand-dark);">Historial de Servicios</h3>';
        sHTML += '<div style="display:flex; flex-direction:column; gap:12px; padding:0 20px 20px 20px;">';
        servicios.forEach(s => {
            const fechaSvc = new Date(s.fecha).toLocaleDateString("es-CO");
            const iconColor = s.conforme ? 'var(--brand-ok)' : 'var(--brand-warn)';
            const iconSvg = s.conforme 
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
                
            sHTML += `
                <div style="background: white; border: 1px solid rgba(0,0,0,0.05); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                    <div style="background: rgba(0,0,0,0.03); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${iconColor};">
                        ${iconSvg}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 14px; font-weight: 700; color: var(--brand-dark); margin-bottom: 2px;">${s.tipoServicio || 'Mantenimiento Preventivo'}</div>
                        <div style="font-size: 12px; color: var(--brand-muted);">OT: ${s.ot || 'N/A'} • ${fechaSvc}</div>
                    </div>
                    <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(0,0,0,0.04); color: var(--brand-muted); padding: 4px 8px; border-radius: 6px;">
                        ${s.conforme ? 'Conforme' : 'Hallazgos'}
                    </div>
                </div>
            `;
        });
        sHTML += '</div>';
    } else {
        sHTML += '<div style="padding: 0 20px 20px 20px; text-align: center; color: var(--brand-muted); font-size: 13px;">No hay servicios previos.</div>';
    }

    list.innerHTML = sHTML;
};

// 5. Cerrar Detalle
window.cerrarDetalleCliente = function() {
    clienteSeleccionadoActual = null;
    document.getElementById('pantalla-detalle').style.display = 'none';
    document.getElementById('pantalla-galeria').style.display = 'block';
};

// Función simulada para Torre de Control (No visible para el técnico en campo)
window.trasladarServicioAdmin = function(ot, tecnicoIdDestino) {
    console.log("Funcionalidad exclusiva del Panel Administrativo.");
    console.log("Se trasladaría la OT " + ot + " al técnico " + tecnicoIdDestino);
};

// 6. Añadir Nuevo Activo desde Hoja de Vida
window.anadirActivoDesdeHdv = function() {
    if (!clienteSeleccionadoActual) return;
    document.getElementById('modal-anadir-activo').style.display = 'flex';
};

window.cerrarModalNuevoActivo = function() {
    document.getElementById('modal-anadir-activo').style.display = 'none';
    document.getElementById('nuevo-activo-codigo').value = '';
    document.getElementById('nuevo-activo-tipo').value = '';
    document.getElementById('nuevo-activo-nombre').value = '';
    document.getElementById('nuevo-activo-ubicacion').value = '';
};

window.guardarNuevoActivo = async function() {
    const btn = event.target;
    const codigo = document.getElementById('nuevo-activo-codigo').value.trim();
    const tipo = document.getElementById('nuevo-activo-tipo').value;
    const nombre = document.getElementById('nuevo-activo-nombre').value.trim();
    const ubicacion = document.getElementById('nuevo-activo-ubicacion').value.trim();
    
    if (!codigo || !tipo) {
        alert("El código y el tipo de activo son obligatorios.");
        return;
    }
    
    const prevText = btn.innerText;
    btn.innerText = "Guardando...";
    btn.disabled = true;
    
    try {
        const token = getAuthToken();
        const res = await fetch(`/api/sedes/${clienteSeleccionadoActual.id}/activos`, {
            method: 'POST',
            headers: { 
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ codigo, tipo, nombre, ubicacion })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Error al guardar el activo');
        }
        
        // Cierra el modal y refresca la hoja de vida
        cerrarModalNuevoActivo();
        await abrirDetalleCliente(clienteSeleccionadoActual.id);
        
        // Notifica de éxito
        alert("¡Activo añadido exitosamente al Motor!");
        
    } catch (e) {
        console.error(e);
        alert(e.message);
    } finally {
        btn.innerText = prevText;
        btn.disabled = false;
    }
};

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
    // Si estamos en un dispositivo móvil, asegurarnos de que la vista actualice bien el padding
    renderGallery();
});
