window.FICHAS = window.FICHAS || {};
window.DB = window.DB || { clients: [], assets: {} };
// Factor de conversión a kW para el cálculo de carga (D.calc) — capacidadUnidad de la ficha.
const toKW = { kW: 1, kVA: 0.92, HP: 0.746, W: 0.001 };
window.D = Object.assign(window.D || {}, {
  client:null, photos:0, newCode:'', activeCode:null, activeId:null, _tt:null,

  // Faltaba por completo — usado por decenas de llamadas en este archivo
  // (togAsset, saveFicha, uploads, QR...) para avisar al técnico. Sin esto,
  // cada aviso tronaba con "D.toast is not a function" y abortaba en silencio
  // lo que viniera después en la misma función.
  toast(msg) {
    const el = document.getElementById('toastMsg');
    const box = document.getElementById('toast');
    if (!el || !box) { console.warn('[toast]', msg); return; }
    el.textContent = msg;
    box.classList.add('show');
    clearTimeout(D._tt);
    D._tt = setTimeout(() => box.classList.remove('show'), 3000);
  },

  seg(btn) { [...btn.parentElement.children].forEach(b=>b.classList.remove('on')); btn.classList.add('on'); },

  togCombo(id) { const c=document.getElementById(id); document.querySelectorAll('.combo').forEach(x=>{if(x.id!==id)x.classList.remove('open');}); c.classList.toggle('open'); },  
  togAsset() { if(!window.clienteActual && !D.client){D.toast('Primero selecciona el cliente');return;} D.togCombo('assetCombo'); },

  async filterClients(v){
    if (window.buscarSedes) {
      const list = await window.buscarSedes(v);
      if (window.renderSugerencias) {
        window.renderSugerencias(list);
      }
    }
  },  
  pickClient(id) {  
    D.client = DB.clients.find(c=>c.id===id);  
    document.querySelector('#clientCombo .combo-input').classList.add('filled');  
    const m=document.getElementById('clientMain'); m.classList.remove('ph'); m.textContent=D.client.name;  
    const s=document.getElementById('clientSub'); s.style.display='block'; s.textContent=D.client.type;  
    document.getElementById('clientCombo').classList.remove('open');  
    document.getElementById('dir').value = D.client.address || '';  
    document.getElementById('assetMain').textContent='Selecciona o crea un activo…';  
    D.renderAssets();  
  },  
  filterAssets(v){
    // Utiliza la lógica real de activos.js que llama a la base de datos
    if (window.loadActivos) {
      window.loadActivos();
    }
  },
  renderAssets() {  
    const arr = DB.assets[D.client.id]||[];  
    document.getElementById('assetList').innerHTML = arr.length ? arr.map(a=>`<div class="combo-opt" onclick="D.pickAsset('${a.code}','${a.type}','${a.desc}')"><div class="co-av">${a.code.slice(0,3)}</div><div class="co-b"><div class="co-name">${a.code}</div><div class="co-meta">${a.type} · ${a.desc}</div></div></div>`).join('') : '<div style="padding:13px;font-size:12px;color:var(--text-faint);text-align:center">Sin activos aún · crea el primero</div>';  
  },  
  pickAsset(id,code,type,desc) {
    // Antes solo openFicha() marcaba D.activeId — si el técnico elegía un
    // activo y nunca abría su ficha, D.activeId se quedaba apuntando al
    // activo anterior. El PDF comparaba eso contra window.fichaGuardadaId
    // para decidir si imprimir la ficha técnica, así que sin esto podía
    // imprimir la ficha de OTRO activo bajo el código del recién elegido.
    D.activeId = id; D.activeCode = code;
    document.getElementById('assetCombo').classList.remove('open');
    document.getElementById('assetCombo').style.display='none';
    const descTxt = `${type}${desc ? ' · ' + desc : ''}`;
    document.getElementById('assetPickedWrap').innerHTML = `<div class="asset-picked"><div class="ap-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M8 14h2"/></svg></div><div><div class="ap-code">${code}</div><div class="ap-desc">${descTxt}</div></div><div class="ap-btns"><button class="ap-view" onclick="D.viewFicha('${id}','${code}','${type}')">Ver / completar ficha</button><button class="ap-change" onclick="D.changeAsset()">Cambiar activo</button></div></div>`;
  },
  changeAsset() { if (window.changeAsset) window.changeAsset(); else { document.getElementById('assetPickedWrap').innerHTML=''; document.getElementById('assetCombo').style.display='block'; } },

  
  openClientCreate() {
    document.getElementById('clientCombo').classList.remove('open');
    document.getElementById('overlayClient').classList.add('open');
    document.getElementById('floatingClient').classList.add('open');
    // Trae la dirección ya escrita en el acta, si el técnico la puso primero
    const dirActa = (document.getElementById('dir')?.value || '').trim();
    if (dirActa) document.getElementById('ncDireccion').value = dirActa;
    D.showSysFields();
  },
  closeClientCreate() { 
    document.getElementById('overlayClient').classList.remove('open'); 
    document.getElementById('floatingClient').classList.remove('open'); 
    document.body.classList.remove('no-scroll');
  },
  togNC(btn, groupId, val, after) {  
    document.getElementById(groupId).querySelectorAll('button').forEach(b=>b.className='');  
    btn.className = val==='si' ? 'sel-si' : 'sel-no';  
    if (after) after(val);  
  },  
  showTrafo(val) {  
    document.getElementById('ncTrafoFields').style.display = val==='si' ? 'block' : 'none';  
    document.getElementById('ncTotalizadorFields').style.display = val==='no' ? 'block' : 'none';  
  },  
  showSolar(val) {  
    document.getElementById('ncSolarFields').style.display = val==='si' ? 'block' : 'none';  
  },  
  showSysFields() {  
    const t = document.getElementById('ncCircuito').value;  
    document.getElementById('sysMono').style.display = t==='mono' ? 'block' : 'none';  
    document.getElementById('sysBi').style.display   = t==='bi'   ? 'block' : 'none';  
    document.getElementById('sysTri').style.display  = t==='tri'  ? 'block' : 'none';  
  },  
  showAssetSysFields() {
    const t = document.getElementById('conx').value;
    document.getElementById('assetSysMono').style.display = t==='mono' ? 'block' : 'none';
    document.getElementById('assetSysBi').style.display   = t==='bi'   ? 'block' : 'none';
    document.getElementById('assetSysTri').style.display  = t==='tri'  ? 'block' : 'none';
    D.calc();
  },

  /**
   * Calculadora de rendimiento eléctrico (kW real vs. capacidad nominal → % de
   * carga + veredicto). Faltaba por completo en esta integración: sin ella,
   * abrir la ficha lanzaba "D.calc is not a function" y la ficha entera no
   * terminaba de abrir (quedaba sin QR, sin datos repoblados). fp=0.9 es el
   * factor de potencia asumido cuando no se mide directamente en campo.
   */
  calc() {
    const conx = document.getElementById('conx').value;
    let v = 0, a = 0;
    if (conx === 'mono') {
      v = parseFloat(document.getElementById('fV').value) || 0;
      a = parseFloat(document.getElementById('fA').value) || 0;
    } else if (conx === 'bi') {
      v = parseFloat(document.getElementById('fV_L1N').value) || 0;
      a = parseFloat(document.getElementById('fI_A').value) || 0;
    } else {
      v = parseFloat(document.getElementById('fV_L1L2t').value) || 0;
      a = parseFloat(document.getElementById('fI_At').value) || 0;
    }
    const nom = parseFloat(document.getElementById('fCap').value) || 0, unit = document.getElementById('fUnit').value;
    const factor = conx === 'tri' ? 1.732 : conx === 'bi' ? 2 : 1, fp = 0.9;
    const missing = document.getElementById('missing');
    if (nom <= 0 || v <= 0 || a <= 0) {
      missing.classList.add('show');
      document.getElementById('missingTxt').textContent = nom <= 0 ? 'Ingresa la capacidad nominal (placa o manual).' : 'Faltan voltaje y/o corriente.';
      document.getElementById('rKw').textContent = '—'; document.getElementById('rCarga').textContent = '—';
      return;
    }
    missing.classList.remove('show');
    const kw = (factor * v * a * fp) / 1000, nomKW = nom * (toKW[unit] || 1), carga = nomKW > 0 ? (kw / nomKW) * 100 : 0;
    document.getElementById('rKw').textContent = kw.toFixed(1);
    const cEl = document.getElementById('rCarga'); cEl.textContent = carga.toFixed(0) + '%';
    document.getElementById('gNeedle').style.left = Math.min(carga, 130) / 1.3 + '%';
    document.getElementById('gVal').textContent = carga.toFixed(0) + '%';
    let cls, vc, vt, vs, vi;
    if (carga > 100) { cls = 'bad'; vc = 'bad'; vt = 'Sobrecargado — evaluar cambio'; vs = 'Supera su capacidad. Riesgo térmico; considerar equipo más eficiente.'; vi = '<path d="M12 2L2 20h20L12 2zM12 9v5M12 17h.01"/>'; }
    else if (carga < 30) { cls = 'warn'; vc = 'bad'; vt = 'Subutilizado — evaluar cambio'; vs = 'Muy sobredimensionado: desperdicia energía.'; vi = '<path d="M12 8v4M12 16h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z"/>'; }
    else { cls = 'good'; vc = 'good'; vt = 'Equipo eficiente'; vs = 'Opera en buen rango. No requiere reemplazo.'; vi = '<path d="M20 6L9 17l-5-5"/>'; }
    cEl.className = 'pc-v ' + cls;
    const ve = document.getElementById('vEff'); ve.className = 'veff ' + vc;
    document.getElementById('veT').textContent = vt; document.getElementById('veS').textContent = vs;
    document.getElementById('veIco').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + vi + '</svg>';
  },

  /** Veredicto SPT: ≤25Ω cumple RETIE, >25Ω no cumple. Umbral hardcodeado
   * a propósito — coincide con RESISTENCIA_UMBRAL_OHM del motor (PATCH ficha),
   * que congela el mismo veredicto al guardar la lectura en asset_readings. */
  checkSpt() {
    const ohm = parseFloat(document.getElementById('ohm').value) || 0, max = 25;
    const v = document.getElementById('ohmVerdict'), cumple = ohm > 0 && ohm <= max;
    v.className = 'res-verdict ' + (cumple ? 'ok' : 'no');
    document.getElementById('ohmT').textContent = cumple ? `Cumple · ≤ ${max} Ω` : `No cumple · supera ${max} Ω`;
    document.getElementById('ohmS').textContent = cumple ? 'Dentro del máximo normativo.' : 'Excede el máximo. Inconformidad RETIE.';
    document.getElementById('ohmIco').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + (cumple ? '<path d="M20 6L9 17l-5-5"/>' : '<path d="M18 6L6 18M6 6l12 12"/>') + '</svg>';
  },
  togSpt(btn, val) { btn.parentElement.querySelectorAll('button').forEach(b => b.className = ''); btn.className = val === 'si' ? 'sel-si' : 'sel-no'; },

  // #createMini es el panel REAL que existe en index.html (mini-formulario tipo+número
  // con vista previa de código). No hay ningún #overlayCreateAsset/#floatingCreateAsset
  // en la página — apuntar ahí rompía "Crear activo nuevo" con un TypeError silencioso.
  openCreate() { document.getElementById('assetCombo').classList.remove('open'); document.getElementById('createMini').classList.add('open'); D.typeChange(); },
  closeCreate() { document.getElementById('createMini').classList.remove('open'); },

  typeChange() {  
    const isOtro = document.getElementById('newType').value === 'otro';  
    document.getElementById('newTypeCustomWrap').style.display = isOtro ? 'block' : 'none';  
    D.code();  
  },  
  customType() { D.code(); },  
  prefixFrom(name) {  
    // Genera un prefijo de 3 letras a partir del nombre escrito (Ej: "Motor" -> "MOT")  
    const clean = name.trim().toUpperCase().replace(/[^A-ZÑ ]/g,'');  
    return clean ? clean.slice(0,3) || 'GEN' : '';  
  },  
  code() {
    const t=document.getElementById('newType').value, n=document.getElementById('newNum').value.trim();
    let prefix = t;
    if (t === 'otro') {
      const custom = document.getElementById('newTypeCustom').value;
      prefix = D.prefixFrom(custom) || '___';
      document.getElementById('customPrefixHint').textContent = prefix;
      document.getElementById('customPrefixHint2').textContent = prefix;
    } else {
      // El <option value> es la CLAVE del tipo ("tablero"), no su prefijo (TAB) —
      // sin este lookup la previsualización mostraba "tablero-9999" y no coincidía
      // con lo que D.createAsset() (activos.js) termina guardando de verdad.
      const catalogado = (window.D.tiposCatalog || []).find((x) => x.clave === t);
      prefix = (catalogado && catalogado.prefijo) ? catalogado.prefijo : t.toUpperCase();
    }
    D.newCode = `${prefix}-${n||'____'}`;
    document.getElementById('codePrev').textContent = D.newCode;
  },
  // window.D.createAsset (real, con persistencia en el motor) vive en activos.js.
  // NO redefinir esa clave aquí: activos.js se carga ANTES que este archivo, y
  // Object.assign(window.D, {...}) pisaría su versión real con una falsa que solo
  // empujaba a DB.assets en memoria — el activo nunca llegaba al motor.

  /* ===== Abrir / ver / editar ficha flotante (identidad + SPT + rendimiento) ===== */
  async openFicha(id, code, typeName, isNew) {
    D.activeCode = code;
    D.activeId = id;
    document.getElementById('flCode').textContent = code;
    document.getElementById('flDesc').textContent = `${typeName} · ${window.clienteActual ? window.clienteActual.nombre : ''}`;
    document.querySelector('.flh-tag').textContent = isNew ? 'Recién creado' : 'Editando ficha';

    D.resetFichaFields();
    document.getElementById('overlay').classList.add('open');
    document.getElementById('floating').classList.add('open');
    D.calc(); D.checkSpt(); D.calcManten();
    D.generateQR(code);
    D.renderAttachments([]);

    // Repuebla desde el motor — sin esto, reabrir un activo con ficha ya
    // guardada mostraría los campos vacíos (parecería que nunca se guardó).
    if (id && window.geHeaders) {
      try {
        const r = await fetch(`/api/activos/${encodeURIComponent(id)}/ficha`, { headers: window.geHeaders() });
        if (r.ok) {
          const { ficha } = await r.json();
          // Marca esta ficha como confiable para el PDF SOLO si de verdad vino
          // del motor — si no hay ficha guardada, resetFichaFields() de arriba
          // dejó valores de ejemplo (120V, 12Ω…) que no son una medición real
          // y no deben imprimirse como si lo fueran.
          if (ficha) { D.applyFicha(ficha); D.calc(); D.checkSpt(); D.calcManten(); window.fichaGuardadaId = id; }
        }
        const ra = await fetch(`/api/activos/${encodeURIComponent(id)}/adjuntos`, { headers: window.geHeaders() });
        if (ra.ok) { const { attachments } = await ra.json(); D.renderAttachments(attachments || []); }
      } catch (e) { console.error('[ficha] no se pudo repoblar', e); }
    }
  },
  viewFicha(id, code, type) { D.openFicha(id, code, type, false); },
  resetFichaFields() {  
    document.getElementById('fObs').value = '';  
    document.getElementById('fMarca').value=''; document.getElementById('fAno').value='';  
    document.getElementById('fCap').value=''; document.getElementById('fUnit').value='kVA';  
    document.getElementById('ohm').value='12';  
    document.getElementById('conx').value='tri';  
    document.getElementById('fV').value='120'; document.getElementById('fA').value='15';  
    document.getElementById('fV_L1N').value='120'; document.getElementById('fV_L2N').value='120'; document.getElementById('fV_L1L2').value='240';  
    document.getElementById('fI_A').value='20'; document.getElementById('fI_B').value='20'; document.getElementById('fI_N').value='2';  
    document.getElementById('fV_L1L2t').value='220'; document.getElementById('fV_L2L3t').value='220'; document.getElementById('fV_L3L1t').value='220';  
    document.getElementById('fV_L1Nt').value='127'; document.getElementById('fV_L2Nt').value='127'; document.getElementById('fV_L3Nt').value='127';  
    document.getElementById('fI_At').value='177'; document.getElementById('fI_Bt').value='177'; document.getElementById('fI_Ct').value='177'; document.getElementById('fI_Nt').value='8';  
    D.showAssetSysFields();
    ['flBarraje','flConductor','flConexiones'].forEach(id=>document.getElementById(id).querySelectorAll('button').forEach(b=>b.className=''));
    D.renderAttachments([]);
    document.getElementById('fMantUltima').value = ''; document.getElementById('fMantFrec').value = '180';
    D.calcManten();  
    const t = document.getElementById('noPlateToggle');  
    if (t.classList.contains('on')) D.toggleNoPlate();  
  },  
  applyFicha(d) {  
    document.getElementById('fObs').value = d.obs || '';  
    document.getElementById('fMarca').value=d.marca||''; document.getElementById('fAno').value=d.ano||'';  
    document.getElementById('fCap').value=d.cap||''; document.getElementById('fUnit').value=d.unit||'kVA';  
    document.getElementById('ohm').value=d.ohm||'12';  
    document.getElementById('conx').value=d.conx||'tri';  
    const M = ['fV','fA','fV_L1N','fV_L2N','fV_L1L2','fI_A','fI_B','fI_N','fV_L1L2t','fV_L2L3t','fV_L3L1t','fV_L1Nt','fV_L2Nt','fV_L3Nt','fI_At','fI_Bt','fI_Ct','fI_Nt'];  
    M.forEach(id => { if (d[id] !== undefined) document.getElementById(id).value = d[id]; });  
    D.showAssetSysFields();
    document.getElementById('fMantUltima').value=d.mantUltima||''; document.getElementById('fMantFrec').value=d.mantFrec||'180';
    // Los adjuntos NO vienen en `d` (no forman parte de collectFicha real) — openFicha()
    // ya los pidió aparte via GET /api/activos/:id/adjuntos y llamó a renderAttachments().
    const setTog = (id,val) => { const g=document.getElementById(id); g.querySelectorAll('button').forEach((b,i)=>{ b.className = (val==='si'&&i===0)||(val==='no'&&i===1) ? (val==='si'?'sel-si':'sel-no') : ''; }); };
    setTog('flBarraje', d.barraje); setTog('flConductor', d.conductor); setTog('flConexiones', d.conexiones);  
  },  
  readTog(id) {  
    const g = document.getElementById(id).querySelectorAll('button');  
    if (g[0].className==='sel-si') return 'si';  
    if (g[1].className==='sel-no') return 'no';  
    return null;  
  },  
  collectFicha() {  
    const d = {  
      obs: document.getElementById('fObs').value,  
      marca: document.getElementById('fMarca').value, ano: document.getElementById('fAno').value,  
      cap: document.getElementById('fCap').value, unit: document.getElementById('fUnit').value,  
      ohm: document.getElementById('ohm').value, conx: document.getElementById('conx').value,  
      barraje: D.readTog('flBarraje'), conductor: D.readTog('flConductor'), conexiones: D.readTog('flConexiones'),
      mantUltima: document.getElementById('fMantUltima').value, mantFrec: document.getElementById('fMantFrec').value,
    };
    ['fV','fA','fV_L1N','fV_L2N','fV_L1L2','fI_A','fI_B','fI_N','fV_L1L2t','fV_L2L3t','fV_L3L1t','fV_L1Nt','fV_L2Nt','fV_L3Nt','fI_At','fI_Bt','fI_Ct','fI_Nt'].forEach(id => { d[id] = document.getElementById(id).value; });  
    return d;  
  },  
  closeFicha() { document.getElementById('overlay').classList.remove('open'); document.getElementById('floating').classList.remove('open'); document.body.classList.remove('no-scroll'); },
  async saveFicha() {
    const id = D.activeId;
    const code = D.activeCode || document.getElementById('flCode').textContent;
    if (!id) { D.toast('No hay un activo activo para guardar'); return; }
    const d = D.collectFicha();
    // mantFiles/evPhotos son adjuntos reales ahora (D.uploadMantDoc/D.addEvidenceFoto
    // ya subieron cada archivo al motor cuando se agregó) — no se reenvían aquí.
    delete d.mantFiles; delete d.evPhotos;
    try {
      const r = await fetch(`/api/activos/${encodeURIComponent(id)}/ficha`, {
        method: 'PATCH',
        headers: window.geHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(d),
      });
      if (!r.ok) { const e = await r.json().catch(()=>null); D.toast(e?.error || 'No se pudo guardar la ficha'); return; }
    } catch (e) {
      console.error('[saveFicha]', e);
      D.toast('Sin conexión: no se pudo guardar la ficha');
      return;
    }
    window.fichaGuardadaId = id;
    D.closeFicha();
    document.getElementById('assetCombo').style.display='none';
    document.getElementById('assetPickedWrap').innerHTML = `<div class="asset-picked"><div class="ap-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M8 14h2"/></svg></div><div><div class="ap-code">${code}</div><div class="ap-desc">Ficha guardada · en base de datos</div></div><div class="ap-btns"><button class="ap-view" onclick="D.viewFicha('${id}','${code}','')">Ver / Editar</button><button class="ap-change" onclick="D.changeAsset()">Cambiar activo</button></div></div>`;
    D.toast('Activo '+code+' guardado en base de datos ✓');
  },

  readPlate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      D.toast('Analizando placa con IA…');
      try {
        const fd = new FormData();
        fd.append('file', file, file.name || 'placa.jpg');
        const r = await fetch('/api/activos/ocr-placa', { method: 'POST', headers: window.geHeaders(), body: fd });
        const d = await r.json().catch(() => null);
        if (!r.ok) { D.toast(d?.error || 'No se pudo leer la placa'); return; }
        const p = d.placa || {};
        if (p.capacidadNominal) document.getElementById('fCap').value = p.capacidadNominal;
        if (p.capacidadUnidad) document.getElementById('fUnit').value = p.capacidadUnidad;
        if (p.marca) document.getElementById('fMarca').value = p.marca;
        if (p.anoFabricacion) document.getElementById('fAno').value = p.anoFabricacion;
        D.calc();
        const leido = [p.capacidadNominal && `${p.capacidadNominal} ${p.capacidadUnidad||''}`, p.marca, p.anoFabricacion].filter(Boolean).join(' · ');
        D.toast(leido ? `Placa leída: ${leido} ✓` : 'No se pudo leer texto en la placa — completa manualmente');
      } catch (e) {
        console.error('[readPlate]', e);
        D.toast('Sin conexión: completa los datos de placa manualmente');
      }
    };
    input.click();
  },

  /* ===== Adjuntos reales del activo (evidencia / sin-placa / mantenimiento) =====
   * Suben de inmediato al motor (POST /api/activos/:id/adjuntos) apenas se elige
   * el archivo — a diferencia de la referencia, que solo guardaba un nombre
   * inventado en un array de memoria. Requieren D.activeId (el activo ya creado);
   * si el técnico aún no guardó el activo, se le pide hacerlo primero. */
  attachments: [],
  async uploadAdjunto(kind, file) {
    if (!D.activeId) { D.toast('Primero crea o selecciona el activo'); return null; }
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file, file.name || kind);
    try {
      const r = await fetch(`/api/activos/${encodeURIComponent(D.activeId)}/adjuntos`, { method: 'POST', headers: window.geHeaders(), body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok) { D.toast(d?.error || 'No se pudo subir el archivo'); return null; }
      return d.attachment;
    } catch (e) {
      console.error('[uploadAdjunto]', e);
      D.toast('Sin conexión: no se pudo subir el archivo');
      return null;
    }
  },
  renderAttachments(list) {
    D.attachments = list || [];
    const byKind = (k) => D.attachments.filter((a) => a.kind === k);
    const icon = (mime) => mime === 'application/pdf'
      ? '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>'
      : '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/>';
    const npList = [...byKind('sin_placa_foto'), ...byKind('sin_placa_doc')];
    document.getElementById('npFilesList').innerHTML = npList.map((f) => `<div class="np-file"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon(f.mimeType)}</svg>${f.originalName || f.kind}</div>`).join('');
    const evList = byKind('evidencia');
    document.getElementById('evPhotos').innerHTML = evList.map((f) => `<div class="ev-thumb"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/></svg>${f.originalName || 'foto'}</div>`).join('');
    document.getElementById('evCountTxt').textContent = evList.length + (evList.length === 1 ? ' foto agregada' : ' fotos agregadas');
    const mantList = byKind('mantenimiento_doc');
    document.getElementById('mantFilesList').innerHTML = mantList.map((f) => `<div class="np-file"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon(f.mimeType)}</svg>${f.originalName || 'informe.pdf'}</div>`).join('');
  },

  /* ===== Sin placa visible — registro fotográfico + documentos ===== */
  toggleNoPlate() {
    const t = document.getElementById('noPlateToggle');
    const on = t.classList.toggle('on');
    document.getElementById('noPlateCheck').querySelector('svg').style.opacity = on?1:0;
    document.getElementById('noPlatePanel').classList.toggle('open', on);
    document.getElementById('plateCapBtn').style.opacity = on ? '0.4' : '1';
    document.getElementById('plateCapBtn').style.pointerEvents = on ? 'none' : 'auto';
  },
  uploadEquipoFotos() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      D.toast('Subiendo foto…');
      const att = await D.uploadAdjunto('sin_placa_foto', file);
      if (att) { D.renderAttachments([...D.attachments, att]); D.toast('Foto agregada al activo'); }
    };
    input.click();
  },
  uploadEquipoDocs() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      D.toast('Subiendo documento…');
      const att = await D.uploadAdjunto('sin_placa_doc', file);
      if (att) { D.renderAttachments([...D.attachments, att]); D.toast('Documento agregado al activo'); }
    };
    input.click();
  },

  /* ===== Evidencia fotográfica general del activo (además de la foto de placa) ===== */
  addEvidenceFoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      D.toast('Subiendo foto de evidencia…');
      const att = await D.uploadAdjunto('evidencia', file);
      if (att) { D.renderAttachments([...D.attachments, att]); D.toast('Foto de evidencia agregada al activo'); }
    };
    input.click();
  },

  /* ===== Mantenimiento — barra interactiva de alerta ===== */
  calcManten() {
    const fechaStr = document.getElementById('fMantUltima').value;  
    const freqDias = parseInt(document.getElementById('fMantFrec').value, 10);  
    const fill = document.getElementById('mantFill');  
    const status = document.getElementById('mantStatus');  
    const pctEl = document.getElementById('mantPct');  
    if (!fechaStr) {  
      fill.style.width = '0%'; fill.style.background = 'var(--border-strong)';  
      status.className = 'mant-status neutral'; status.textContent = 'Ingresa la última fecha para calcular';  
      pctEl.textContent = '—';  
      return;  
    }  
    const ultima = new Date(fechaStr);  
    const hoy = new Date();  
    const diasTranscurridos = Math.floor((hoy - ultima) / 86400000);  
    const diasRestantes = freqDias - diasTranscurridos;  
    const pct = Math.max(0, Math.min((diasTranscurridos / freqDias) * 100, 130));

    fill.style.width = Math.min(pct, 100) + '%';

    if (diasRestantes < 0) {  
      fill.style.background = 'var(--red)';  
      status.className = 'mant-status bad';  
      status.textContent = `Vencido hace ${Math.abs(diasRestantes)} días · alerta activa`;  
      pctEl.textContent = pct.toFixed(0)+'%';  
    } else if (diasRestantes <= 15) {  
      fill.style.background = 'var(--amber)';  
      status.className = 'mant-status warn';  
      status.textContent = `Próximo mantenimiento en ${diasRestantes} días`;  
      pctEl.textContent = pct.toFixed(0)+'%';  
    } else {  
      fill.style.background = 'var(--green)';  
      status.className = 'mant-status ok';  
      status.textContent = `Próximo mantenimiento en ${diasRestantes} días`;  
      pctEl.textContent = pct.toFixed(0)+'%';  
    }  
  },  
  uploadMantDoc() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      D.toast('Subiendo informe…');
      const att = await D.uploadAdjunto('mantenimiento_doc', file);
      if (att) { D.renderAttachments([...D.attachments, att]); D.toast('Informe de mantenimiento agregado'); }
    };
    input.click();
  },

  /* ===== Etiqueta QR — genera y liga al código del activo ===== */  
  qrInstance: null,  
  generateQR(code) {
    document.getElementById('qrCodeTxt').textContent = code;
    // window.location.origin (no dominio hardcodeado): así el QR generado en
    // local/staging apunta a ESE host, no siempre a producción.
    const url = `${window.location.origin}/activo/${code}`;
    const box = document.getElementById('qrPreview');  
    box.innerHTML = '';  
    if (typeof QRCode === 'undefined') {  
      box.innerHTML = `<div style="font-size:9px;color:var(--text-faint);text-align:center;padding:6px">QR no disponible sin conexión</div>`;  
      return;  
    }  
    D.qrInstance = new QRCode(box, { text:url, width:80, height:80, colorDark:'#2B3000', colorLight:'#FFFFFF', correctLevel:QRCode.CorrectLevel.M });  
  },  
  downloadQR() {  
    const canvas = document.querySelector('#qrPreview canvas');  
    if (!canvas) { D.toast('Genera el QR primero'); return; }  
    const code = document.getElementById('qrCodeTxt').textContent;  
    const link = document.createElement('a');  
    link.download = `etiqueta-${code}.png`;  
    link.href = canvas.toDataURL('image/png');  
    link.click();  
    D.toast('Etiqueta QR de '+code+' descargada ✓');  
  },  
  printQR() {
    const canvas = document.querySelector('#qrPreview canvas');
    if (!canvas) { D.toast('Genera el QR primero'); return; }
    const code = document.getElementById('qrCodeTxt').textContent;
    const win = window.open('', '_blank', 'width=420,height=520');
    win.document.write(`<html><head><title>Etiqueta ${code}</title><style>
      body{font-family:sans-serif;text-align:center;padding:30px;}
      .label{border:2px solid #2B3000;border-radius:14px;padding:20px;display:inline-block;}
      img{width:160px;height:160px;}
      .code{font-size:18px;font-weight:800;color:#2B3000;margin-top:10px;letter-spacing:1px;}
      .brand{font-size:10px;color:#6E7553;margin-top:4px;}
    </style></head><body>
      <div class="label"><img src="${canvas.toDataURL('image/png')}"><div class="code">${code}</div><div class="brand">Gestiones Eléctricas SAS</div></div>
      <script>window.onload=()=>window.print()<\/script>
    </body></html>`);
    win.document.close();
  }
});
