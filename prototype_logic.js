  
/\* ====== DATOS (vendrían de la API) ====== \*/  
const DB = {  
  clients: \[  
    { id:'c1', name:'ATENAS', type:'Comercial', assets:3, address:'Calle 75 Cr 72 90' },  
    { id:'c2', name:'Edificio Torres del Parque', type:'Propiedad horizontal', assets:12, address:'Cra 51B \# 80-25' },  
    { id:'c3', name:'Industrias del Caribe SAS', type:'Industrial', assets:58, address:'Vía 40 \# 76-120' }  
  \],  
  assets: {  
    c1:\[ {code:'TAB-2340', type:'Tablero', desc:'Tablero recepción'}, {code:'ACO-0011', type:'Acometida', desc:'Acometida principal'} \],  
    c2:\[ {code:'TAB-01', type:'Tablero', desc:'General sótano'}, {code:'TRF-01', type:'Transformador', desc:'75 kVA'} \],  
    c3:\[ {code:'TRF-02', type:'Transformador', desc:'Subestación 2'} \]  
  }  
};  
const TYPE_NAME = { TAB:'Tablero', ACO:'Acometida', TRF:'Transformador', SPT:'SPT / Tierra', GEN:'General' };  
const FICHAS = {}; // { 'TAB-2345': {marca, ano, cap, unit, ohm, v, a, conx, barraje, conductor, conexiones} } — vendría de GET /activos/:codigo  
const CHECKLIST = \['Tablero eléctrico principal','Protecciones termomagnéticas (Breakers)','Acometida y medidores de energía','Conductores eléctricos y canalizaciones','Sistema de puesta a tierra (SPT)','Tomacorrientes y salidas GFCI','Iluminación y luminarias','Señalización de seguridad eléctrica'\];  
const toKW = { kW:1, kVA:0.92, HP:0.746, W:0.001 };

const D = {  
  client:null, photos:0, newCode:'', activeCode:null,

  init() {  
    D.renderClients();  
    D.renderChecklist();  
    D.calc(); D.checkSpt();  
  },

  seg(btn) { \[...btn.parentElement.children\].forEach(b=>b.classList.remove('on')); btn.classList.add('on'); },

  togCombo(id) { const c=document.getElementById(id); document.querySelectorAll('.combo').forEach(x=>{if(x.id!==id)x.classList.remove('open');}); c.classList.toggle('open'); },  
  togAsset() { if(!D.client){D.toast('Primero selecciona el cliente');return;} D.togCombo('assetCombo'); },

  renderClients(f='') {  
    const list = DB.clients.filter(c=>c.name.toLowerCase().includes(f.toLowerCase()));  
    document.getElementById('clientList').innerHTML = list.map(c=>\`<div class="combo-opt" onclick="D.pickClient('${c.id}')"><div class="co-av">${c.name.slice(0,2).toUpperCase()}</div><div class="co-b"><div class="co-name">${c.name}</div><div class="co-meta">${c.type}</div></div><span class="co-count">${c.assets} activos</span></div>\`).join('') || '<div style="padding:13px;font-size:12px;color:var(--text-faint);text-align:center">Sin resultados</div>';  
  },  
  filterClients(v){ D.renderClients(v); },  
  pickClient(id) {  
    D.client = DB.clients.find(c=>c.id===id);  
    document.querySelector('\#clientCombo .combo-input').classList.add('filled');  
    const m=document.getElementById('clientMain'); m.classList.remove('ph'); m.textContent=D.client.name;  
    const s=document.getElementById('clientSub'); s.style.display='block'; s.textContent=D.client.type;  
    document.getElementById('clientCombo').classList.remove('open');  
    document.getElementById('dir').value = D.client.address || '';  
    document.getElementById('assetMain').textContent='Selecciona o crea un activo…';  
    D.renderAssets();  
  },  
  renderAssets() {  
    const arr = DB.assets\[D.client.id\]||\[\];  
    document.getElementById('assetList').innerHTML = arr.length ? arr.map(a=>\`<div class="combo-opt" onclick="D.pickAsset('${a.code}','${a.type}','${a.desc}')"><div class="co-av">${a.code.slice(0,3)}</div><div class="co-b"><div class="co-name">${a.code}</div><div class="co-meta">${a.type} · ${a.desc}</div></div></div>\`).join('') : '<div style="padding:13px;font-size:12px;color:var(--text-faint);text-align:center">Sin activos aún · crea el primero</div>';  
  },  
  pickAsset(code,type,desc) {  
    document.getElementById('assetCombo').classList.remove('open');  
    document.getElementById('assetCombo').style.display='none';  
    const hasFicha = !!FICHAS\[code\];  
    const descTxt = hasFicha ? 'Ficha guardada · en base de datos' : \`${type} · ${desc}\`;  
    document.getElementById('assetPickedWrap').innerHTML = \`<div class="asset-picked"><div class="ap-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M8 14h2"/></svg></div><div><div class="ap-code">${code}</div><div class="ap-desc">${descTxt}</div></div><div class="ap-btns"><button class="ap-view" onclick="D.viewFicha('${code}','${type}')">${hasFicha?'Ver / Editar':'Completar ficha'}</button><button class="ap-change" onclick="D.changeAsset()">Cambiar activo</button></div></div>\`;  
  },  
  changeAsset() { document.getElementById('assetPickedWrap').innerHTML=''; document.getElementById('assetCombo').style.display='block'; },

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
    const clean = name.trim().toUpperCase().replace(/\[^A-ZÑ \]/g,'');  
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
    }  
    D.newCode = \`${prefix}-${n||'____'}\`;  
    document.getElementById('codePrev').textContent = D.newCode;  
  },  
  createAsset() {  
    const t=document.getElementById('newType').value, n=document.getElementById('newNum').value.trim();  
    if(!n){ D.toast('Escribe el número del activo'); return; }  
    let prefix = t, typeName = TYPE_NAME\[t\];  
    if (t === 'otro') {  
      const custom = document.getElementById('newTypeCustom').value.trim();  
      if (!custom) { D.toast('Escribe el nombre del nuevo tipo de activo'); return; }  
      prefix = D.prefixFrom(custom);  
      typeName = custom;  
      TYPE_NAME\[prefix\] = custom; // registra el tipo nuevo para reutilizarlo  
    }  
    const code=\`${prefix}-${n}\`;  
    DB.assets\[D.client.id\]=DB.assets\[D.client.id\]||\[\];  
    DB.assets\[D.client.id\].push({code,type:typeName,desc:'Nuevo activo'});  
    D.closeCreate();  
    D.openFicha(code, typeName, true);  
  },

  /\* ===== Abrir / ver / editar ficha flotante (identidad \+ SPT \+ rendimiento) ===== \*/  
  openFicha(code, typeName, isNew) {  
    D.activeCode = code;  
    document.getElementById('flCode').textContent = code;  
    document.getElementById('flDesc').textContent = \`${typeName} · ${D.client ? D.client.name : ''}\`;  
    document.querySelector('.flh-tag').textContent = isNew ? 'Recién creado' : 'Editando ficha';

    const saved = FICHAS\[code\];  
    if (saved) { D.applyFicha(saved); }  
    else { D.resetFichaFields(); }

    document.getElementById('overlay').classList.add('open');  
    document.getElementById('floating').classList.add('open');  
    D.calc(); D.checkSpt(); D.calcManten();  
    D.generateQR(code);  
  },  
  viewFicha(code, type) { D.openFicha(code, type, false); },  
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
    \['flBarraje','flConductor','flConexiones'\].forEach(id=>document.getElementById(id).querySelectorAll('button').forEach(b=>b.className=''));  
    D.npFiles = \[\]; D.renderNpFiles();  
    D.evPhotos = \[\]; D.renderEvPhotos();  
    D.mantFiles = \[\]; D.renderMantFiles();  
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
    const M = \['fV','fA','fV_L1N','fV_L2N','fV_L1L2','fI_A','fI_B','fI_N','fV_L1L2t','fV_L2L3t','fV_L3L1t','fV_L1Nt','fV_L2Nt','fV_L3Nt','fI_At','fI_Bt','fI_Ct','fI_Nt'\];  
    M.forEach(id => { if (d\[id\] !== undefined) document.getElementById(id).value = d\[id\]; });  
    D.showAssetSysFields();  
    document.getElementById('fMantUltima').value=d.mantUltima||''; document.getElementById('fMantFrec').value=d.mantFrec||'180';  
    D.mantFiles = d.mantFiles || \[\]; D.renderMantFiles();  
    D.evPhotos = d.evPhotos || \[\]; D.renderEvPhotos();  
    const setTog = (id,val) => { const g=document.getElementById(id); g.querySelectorAll('button').forEach((b,i)=>{ b.className = (val==='si'&\&i===0)||(val==='no'&\&i===1) ? (val==='si'?'sel-si':'sel-no') : ''; }); };  
    setTog('flBarraje', d.barraje); setTog('flConductor', d.conductor); setTog('flConexiones', d.conexiones);  
  },  
  readTog(id) {  
    const g = document.getElementById(id).querySelectorAll('button');  
    if (g\[0\].className==='sel-si') return 'si';  
    if (g\[1\].className==='sel-no') return 'no';  
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
      mantFiles: D.mantFiles.slice(), evPhotos: D.evPhotos.slice()  
    };  
    \['fV','fA','fV_L1N','fV_L2N','fV_L1L2','fI_A','fI_B','fI_N','fV_L1L2t','fV_L2L3t','fV_L3L1t','fV_L1Nt','fV_L2Nt','fV_L3Nt','fI_At','fI_Bt','fI_Ct','fI_Nt'\].forEach(id => { d\[id\] = document.getElementById(id).value; });  
    return d;  
  },  
  closeFicha() { document.getElementById('overlay').classList.remove('open'); document.getElementById('floating').classList.remove('open'); },  
  saveFicha() {  
    const code = D.activeCode || document.getElementById('flCode').textContent;  
    FICHAS\[code\] = D.collectFicha();  
    D.closeFicha();  
    document.getElementById('assetCombo').style.display='none';  
    document.getElementById('assetPickedWrap').innerHTML = \`<div class="asset-picked"><div class="ap-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M8 14h2"/></svg></div><div><div class="ap-code">${code}</div><div class="ap-desc">Ficha guardada · en base de datos</div></div><div class="ap-btns"><button class="ap-view" onclick="D.viewFicha('${code}','')">Ver / Editar</button><button class="ap-change" onclick="D.changeAsset()">Cambiar activo</button></div></div>\`;  
    D.toast('Activo '+code+' guardado en base de datos ✓');  
  },

  readPlate() {  
    document.getElementById('fCap').value='75';  
    document.getElementById('fUnit').value='kVA';  
    document.getElementById('fMarca').value='Siemens';  
    document.getElementById('fAno').value='2020';  
    D.calc();  
    D.toast('Placa leída: 75 kVA · 220V · FP 0.92 ✓');  
  },

  /\* ===== Sin placa visible — registro fotográfico \+ documentos ===== \*/  
  npFiles: \[\],  
  toggleNoPlate() {  
    const t = document.getElementById('noPlateToggle');  
    const on = t.classList.toggle('on');  
    document.getElementById('noPlateCheck').querySelector('svg').style.opacity = on?1:0;  
    document.getElementById('noPlatePanel').classList.toggle('open', on);  
    document.getElementById('plateCapBtn').style.opacity = on ? '0.4' : '1';  
    document.getElementById('plateCapBtn').style.pointerEvents = on ? 'none' : 'auto';  
  },  
  uploadEquipoFotos() {  
    D.npFiles.push({name:'foto_equipo_'+(D.npFiles.length+1)+'.jpg', icon:'foto'});  
    D.renderNpFiles();  
    D.toast('Foto agregada · la IA la analizará para estimar características');  
  },  
  uploadEquipoDocs() {  
    D.npFiles.push({name:'ficha_tecnica.pdf', icon:'pdf'});  
    D.renderNpFiles();  
    D.toast('Documento agregado · la IA extraerá datos del PDF');  
  },  
  renderNpFiles() {  
    document.getElementById('npFilesList').innerHTML = D.npFiles.map(f=>\`<div class="np-file"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${f.icon==='pdf'?'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>':'<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/>'}</svg>${f.name}</div>\`).join('');  
  },

  /\* ===== Evidencia fotográfica general del activo (además de la foto de placa) ===== \*/  
  evPhotos: \[\],  
  addEvidenceFoto() {  
    D.evPhotos.push('evidencia_'+(D.evPhotos.length+1)+'.jpg');  
    D.renderEvPhotos();  
    D.toast('Foto de evidencia agregada al activo');  
  },  
  removeEvidenceFoto(i) { D.evPhotos.splice(i,1); D.renderEvPhotos(); },  
  renderEvPhotos() {  
    document.getElementById('evPhotos').innerHTML = D.evPhotos.map((f,i)=>\`<div class="ev-thumb"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/></svg>${f}<span class="ev-x" onclick="event.stopPropagation();D.removeEvidenceFoto(${i})">×</span></div>\`).join('');  
    document.getElementById('evCountTxt').textContent = D.evPhotos.length \+ (D.evPhotos.length===1?' foto agregada':' fotos agregadas');  
  },

  /\* ===== Mantenimiento — barra interactiva de alerta ===== \*/  
  mantFiles: \[\],  
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
    const pct = Math.max(0, Math.min((diasTranscurridos / freqDias) \* 100, 130));

    fill.style.width = Math.min(pct, 100\) \+ '%';

    if (diasRestantes < 0\) {  
      fill.style.background = 'var(--red)';  
      status.className = 'mant-status bad';  
      status.textContent = \`Vencido hace ${Math.abs(diasRestantes)} días · alerta activa\`;  
      pctEl.textContent = pct.toFixed(0)+'%';  
    } else if (diasRestantes <= 15\) {  
      fill.style.background = 'var(--amber)';  
      status.className = 'mant-status warn';  
      status.textContent = \`Próximo mantenimiento en ${diasRestantes} días\`;  
      pctEl.textContent = pct.toFixed(0)+'%';  
    } else {  
      fill.style.background = 'var(--green)';  
      status.className = 'mant-status ok';  
      status.textContent = \`Próximo mantenimiento en ${diasRestantes} días\`;  
      pctEl.textContent = pct.toFixed(0)+'%';  
    }  
  },  
  uploadMantDoc() {  
    D.mantFiles.push({name:'informe_mantenimiento_'+(D.mantFiles.length+1)+'.pdf', icon:'pdf'});  
    D.renderMantFiles();  
    D.toast('Informe de mantenimiento agregado');  
  },  
  renderMantFiles() {  
    document.getElementById('mantFilesList').innerHTML = D.mantFiles.map(f=>\`<div class="np-file"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>${f.name}</div>\`).join('');  
  },

  /\* ===== Etiqueta QR — genera y liga al código del activo ===== \*/  
  qrInstance: null,  
  generateQR(code) {  
    document.getElementById('qrCodeTxt').textContent = code;  
    const url = \`https://actas.gestioneselectricas.com/activo/${code}\`; // GET /activos/:codigo → hoja de vida  
    const box = document.getElementById('qrPreview');  
    box.innerHTML = '';  
    if (typeof QRCode === 'undefined') {  
      box.innerHTML = \`<div style="font-size:9px;color:var(--text-faint);text-align:center;padding:6px">QR no disponible sin conexión</div>\`;  
      return;  
    }  
    D.qrInstance = new QRCode(box, { text:url, width:80, height:80, colorDark:'\#2B3000', colorLight:'\#FFFFFF', correctLevel:QRCode.CorrectLevel.M });  
  },  
  downloadQR() {  
    const canvas = document.querySelector('\#qrPreview canvas');  
    if (!canvas) { D.toast('Genera el QR primero'); return; }  
    const code = document.getElementById('qrCodeTxt').textContent;  
    const link = document.createElement('a');  
    link.download = \`etiqueta-${code}.png\`;  
    link.href = canvas.toDataURL('image/png');  
    link.click();  
    D.toast('Etiqueta QR de '+code+' descargada ✓');  
  },  
  printQR() {  
    const canvas = document.querySelector('\#qrPreview canvas');  
    if (!canvas) { D.toast('Genera el QR primero'); return; }  
    const code = document.getElementById('qrCodeTxt').textContent;  
    const win = window.open('', '_blank', 'width=420,height=520');  
    win.document.write(\`<html><head><title>Etiqueta ${code}</title><style>  
      body{font-family:sans-serif;text-align:center;padding:30px;}  
      .label{border:2px solid \#2B3000;border-radius:14px;padding:20px;display:inline-block;}  
      img{width:160px;height:160px;}  
      .code{font-size:18px;font-weight:800;color:\#2B3000;margin-top:10px;letter-spacing:1px;}  
      .brand{font-size:10px;color:\#6E7553;margin-top:4px;}  
    </style></head><body>  
      <div class="label"><img src="${canvas.toDataURL('image/png')}"><div class="code">${code}</div><div class="brand">Gestiones Eléctricas SAS</div></div>  
      <script>window.onload=()=>window.print()<\\/script>  
    </body></html>\`);  
    win.document.close();  
  },

  renderChecklist() {  
    document.getElementById('checklist').innerHTML = CHECKLIST.map((c,i)=>\`<div class="chk-item ok" data-st="ok" onclick="D.cycleChk(this)"><div class="chk-box"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div><div class="chk-txt">${c}</div><div class="chk-state">Conforme</div></div>\`).join('');  
  },  
  cycleChk(el) {  
    const order=\['ok','fail','neutral'\], cur=el.dataset.st, next=order\[(order.indexOf(cur)+1)%3\];  
    el.dataset.st=next; el.className='chk-item '+next;  
    const box=el.querySelector('.chk-box'), st=el.querySelector('.chk-state');  
    if(next==='ok'){ box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'; st.textContent='Conforme'; }  
    else if(next==='fail'){ box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'; st.textContent='Falla'; }  
    else { box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>'; st.textContent='Neutral'; }  
  },

  snap(el) { if(!el.classList.contains('filled')){ el.classList.add('filled'); D.photos++; document.getElementById('photoCount').textContent=D.photos+' / 10 espacios'; } },

  calc() {  
    const conx=document.getElementById('conx').value;  
    let v=0, a=0;  
    if (conx==='mono') {  
      v=parseFloat(document.getElementById('fV').value)||0;  
      a=parseFloat(document.getElementById('fA').value)||0;  
    } else if (conx==='bi') {  
      v=parseFloat(document.getElementById('fV_L1N').value)||0;  
      a=parseFloat(document.getElementById('fI_A').value)||0;  
    } else {  
      v=parseFloat(document.getElementById('fV_L1L2t').value)||0;  
      a=parseFloat(document.getElementById('fI_At').value)||0;  
    }  
    const nom=parseFloat(document.getElementById('fCap').value)||0, unit=document.getElementById('fUnit').value;  
    const factor = conx==='tri'?1.732:conx==='bi'?2:1, fp=0.9;  
    const missing=document.getElementById('missing');  
    if(nom<=0||v<=0||a<=0){  
      missing.classList.add('show');  
      document.getElementById('missingTxt').textContent = nom<=0?'Ingresa la capacidad nominal (placa o manual).':'Faltan voltaje y/o corriente.';  
      document.getElementById('rKw').textContent='—'; document.getElementById('rCarga').textContent='—';  
      return;  
    }  
    missing.classList.remove('show');  
    const kw=(factor\*v\*a\*fp)/1000, nomKW=nom\*(toKW\[unit\]||1), carga=nomKW>0?(kw/nomKW)\*100:0;  
    document.getElementById('rKw').textContent=kw.toFixed(1);  
    const cEl=document.getElementById('rCarga'); cEl.textContent=carga.toFixed(0)+'%';  
    document.getElementById('gNeedle').style.left=Math.min(carga,130)/1.3+'%';  
    document.getElementById('gVal').textContent=carga.toFixed(0)+'%';  
    let cls,vc,vt,vs,vi;  
    if(carga>100){cls='bad';vc='bad';vt='Sobrecargado — evaluar cambio';vs='Supera su capacidad. Riesgo térmico; considerar equipo más eficiente.';vi='<path d="M12 2L2 20h20L12 2zM12 9v5M12 17h.01"/>';}  
    else if(carga<30){cls='warn';vc='bad';vt='Subutilizado — evaluar cambio';vs='Muy sobredimensionado: desperdicia energía.';vi='<path d="M12 8v4M12 16h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z"/>';}  
    else {cls='good';vc='good';vt='Equipo eficiente';vs='Opera en buen rango. No requiere reemplazo.';vi='<path d="M20 6L9 17l-5-5"/>';}  
    cEl.className='pc-v '+cls;  
    const ve=document.getElementById('vEff'); ve.className='veff '+vc;  
    document.getElementById('veT').textContent=vt; document.getElementById('veS').textContent=vs;  
    document.getElementById('veIco').innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+vi+'</svg>';  
  },

  checkSpt() {  
    const ohm=parseFloat(document.getElementById('ohm').value)||0, max=25;  
    const v=document.getElementById('ohmVerdict'), cumple=ohm>0&\&ohm<=max;  
    v.className='res-verdict '+(cumple?'ok':'no');  
    document.getElementById('ohmT').textContent=cumple?\`Cumple · ≤ ${max} Ω\`:\`No cumple · supera ${max} Ω\`;  
    document.getElementById('ohmS').textContent=cumple?'Dentro del máximo normativo.':'Excede el máximo. Inconformidad RETIE.';  
    document.getElementById('ohmIco').innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+(cumple?'<path d="M20 6L9 17l-5-5"/>':'<path d="M18 6L6 18M6 6l12 12"/>')+'</svg>';  
  },  
  togSpt(btn,val){ btn.parentElement.querySelectorAll('button').forEach(b=>b.className=''); btn.className=val==='si'?'sel-si':'sel-no'; },

  /\* ===== Nuevo cliente — infraestructura eléctrica ===== \*/  
  openClientCreate() {  
    document.getElementById('clientCombo').classList.remove('open');  
    document.getElementById('overlayClient').classList.add('open');  
    document.getElementById('floatingClient').classList.add('open');  
    // Trae la dirección ya escrita en el acta, si el técnico la puso primero  
    const dirActa = document.getElementById('dir').value.trim();  
    if (dirActa) document.getElementById('ncDireccion').value = dirActa;  
    D.showSysFields();  
  },  
  closeClientCreate() {  
    document.getElementById('overlayClient').classList.remove('open');  
    document.getElementById('floatingClient').classList.remove('open');  
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
  saveClient() {  
    const nombre = document.getElementById('ncNombre').value.trim();  
    if (!nombre) { D.toast('Escribe el nombre del cliente'); return; }  
    const direccion = document.getElementById('ncDireccion').value.trim();  
    const tipo = document.getElementById('ncTipoCliente').value;  
    const id = 'c' \+ (Object.keys(DB.assets).length \+ 1 \+ Math.floor(Math.random()\*1000));  
    DB.clients.push({ id, name:nombre, type:tipo, assets:0, address:direccion });  
    DB.assets\[id\] = \[\];  
    D.closeClientCreate();  
    D.renderClients();  
    D.pickClient(id);  
    // Refleja la dirección capturada en la ficha del cliente hacia el acta  
    document.getElementById('dir').value = direccion;  
    D.toast('Cliente "'+nombre+'" ('+tipo+') creado con su infraestructura eléctrica ✓');  
  },

  sendReview() {  
    const num = document.getElementById('reviewPhone').value.trim();  
    if (!num) { D.toast('Escribe el WhatsApp del cliente'); return; }  
    D.toast('Link de reseña Google enviado a '+num+' por WhatsApp ✓');  
  },

  _tt:null,  
  toast(msg){ document.getElementById('toastMsg').textContent=msg; const t=document.getElementById('toast'); t.classList.add('show'); clearTimeout(D._tt); D._tt=setTimeout(()=>t.classList.remove('show'),3000); }  
};  
document.addEventListener('DOMContentLoaded', D.init);  
document.addEventListener('click', e=>{ if(!e.target.closest('.combo')) document.querySelectorAll('.combo').forEach(c=>c.classList.remove('open')); });  
