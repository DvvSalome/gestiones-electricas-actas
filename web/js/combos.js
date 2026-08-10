/**
 * Lógica pura de interfaz para comboboxes y modales del cliente/activo.
 * La inyección de datos (fetch) se hace desde historial-cliente.js y activos.js
 */

const UI = {
  // === COMBOBOXES GLOBALES ===
  togCombo(id) {
    const c = document.getElementById(id);
    document.querySelectorAll('.combo').forEach(x => {
      if (x.id !== id) x.classList.remove('open');
    });
    c.classList.toggle('open');
  },
  
  togAsset() {
    // Si no hay un cliente en el store global (D.clienteActual en actas app), avisar
    if (typeof window.clienteActual === 'undefined' || !window.clienteActual) {
      if (typeof app !== 'undefined' && app.toast) app.toast('Primero selecciona o crea un cliente', 'error');
      else alert('Primero selecciona un cliente');
      return;
    }
    UI.togCombo('assetCombo');
  },

  // === NUEVO CLIENTE (MODAL) ===
  openClientCreate() {
    document.getElementById('clientCombo').classList.remove('open');
    document.getElementById('overlayClient').classList.add('open');
    document.getElementById('floatingClient').classList.add('open');
    
    // Si ya se escribió una dirección en el acta principal, heredarla
    const dirActa = document.getElementById('field-direccion') ? document.getElementById('field-direccion').value.trim() : '';
    if (dirActa) document.getElementById('ncDireccion').value = dirActa;
    
    UI.showSysFields();
  },
  
  closeClientCreate() {
    document.getElementById('overlayClient').classList.remove('open');
    document.getElementById('floatingClient').classList.remove('open');
  },
  
  togNC(btn, groupId, val, after) {
    document.getElementById(groupId).querySelectorAll('button').forEach(b => b.className = '');
    btn.className = val === 'si' ? 'sel-si' : 'sel-no';
    if (after) after(val);
  },
  
  showTrafo(val) {
    document.getElementById('ncTrafoFields').style.display = val === 'si' ? 'block' : 'none';
    document.getElementById('ncTotalizadorFields').style.display = val === 'no' ? 'block' : 'none';
  },
  
  showSysFields() {
    const t = document.getElementById('ncCircuito').value;
    document.getElementById('sysMono').style.display = t === 'mono' ? 'block' : 'none';
    document.getElementById('sysBi').style.display   = t === 'bi'   ? 'block' : 'none';
    document.getElementById('sysTri').style.display  = t === 'tri'  ? 'block' : 'none';
  },

  // === MINI PANEL NUEVO ACTIVO ===
  openCreateAssetMini() {
    document.getElementById('assetCombo').classList.remove('open');
    document.getElementById('createMini').classList.add('open');
    UI.typeChange();
  },
  
  closeCreateAssetMini() {
    document.getElementById('createMini').classList.remove('open');
  },
  
  typeChange() {
    const isOtro = document.getElementById('newType').value === 'otro';
    document.getElementById('newTypeCustomWrap').style.display = isOtro ? 'block' : 'none';
    UI.generateCodePreview();
  },
  
  prefixFrom(name) {
    const clean = name.trim().toUpperCase().replace(/[^A-ZÑ ]/g, '');
    return clean ? clean.slice(0, 3) || 'GEN' : '';
  },
  
  generateCodePreview() {
    const t = document.getElementById('newType').value;
    const n = document.getElementById('newNum').value.trim();
    let prefix = t;
    if (t === 'otro') {
      const custom = document.getElementById('newTypeCustom').value;
      prefix = UI.prefixFrom(custom) || '___';
      document.getElementById('customPrefixHint').textContent = prefix;
      document.getElementById('customPrefixHint2').textContent = prefix;
    }
    const newCode = `${prefix}-${n || '____'}`;
    document.getElementById('codePrev').textContent = newCode;
  }
};

// Cierra los combobox al dar click afuera
document.addEventListener('click', e => {
  if (!e.target.closest('.combo')) {
    document.querySelectorAll('.combo').forEach(c => c.classList.remove('open'));
  }
});

// Registrar UI global
window.UI = UI;
