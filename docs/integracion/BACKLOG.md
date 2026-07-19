# BACKLOG — Integración Acta Digital ↔ ElectroScan 360 (loop por fases)

**Fuente:** análisis multiagente 2026-07-19 (6 agentes) en `docs/integracion/` — plan del arquitecto
(`plan-arquitecto.md`) CON las correcciones del crítico adversarial (`critica-adversarial.md`) ya
incorporadas aquí. Ante duda, la crítica manda (verificó todo con archivo:línea).

**Arquitectura objetivo (pizarrones del cliente):** "El Acta recoge. El Motor diagnostica." — el motor
vive DENTRO del acta (paso de la foto), persistencia por ACTIVO (hoja de vida), un motor varias puertas
(acta → certificación → portal cliente → centro de control). "El PDF es lo que se lleva el cliente.
Los datos son la empresa."

## Reglas de cada iteración (OBLIGATORIAS)

1. UNA iteración = UN checkbox. Completo: código → typecheck → commit+push → deploy (Coolify API) → verificación e2e real (curl/DB/SSH root@2.24.83.195). Nada a medias; si no alcanza, working tree limpio + nota en bitácora.
2. Prod es sagrado ×2: el ACTA la usan técnicos HOY en Vercel (no romperla antes del cutover) y ElectroScan está LIVE. Recetas de recuperación en memoria del proyecto (cola Coolify, buildkit, pg-boss zombie).
3. Repos: acta = `D:/TRABAJos PROPIOS/projects/gestiones-electricas-actas` (github FOURGSOLUTIONS-FGS/gestiones-electricas-actas) · motor = `D:/TRABAJOS PROPIOS/projects/electroscan360`. Identidad git Adriangar333 ANTES del primer commit en repos nuevos.
4. Marca del CLIENTE: lima #C9E400 + navy #1F1F40 + DM Sans, tema claro/oscuro con los tokens de Adrián (globals.css de ElectroScan). Nada FourG.
5. Costos LLM: máx 1 inspección de prueba por iteración; el diagnóstico del acta es BAJO DEMANDA (botón), nunca automático.
6. Si Adrián escribió en el chat, sus instrucciones mandan. Las **decisiones abiertas** de abajo NO se asumen: si una fase la necesita y no está respondida, usar la recomendación marcada y ANOTARLO.
7. Al terminar cada ítem: marcar `[x]` + fecha + commit, línea en bitácora, memoria si hay gotcha.

## F1 — Acta viva en el VPS (paridad + migración + cutover)

- [x] **F1.1 Port a Express + Postgres** (2026-07-19, commit 2962eee): `apps/actas/` en el repo del acta: `server.js` (express.static('web') + rutas), port mecánico de las 5 functions `api/*.js` → `src/routes/`, Dockerfile node:20-alpine (HEALTHCHECK /api/health), `.dockerignore` excluye `web/publicidad/*.mp4`. Storage: **schema `actas` en el MISMO Postgres del motor** (corrección del crítico a la decisión #3 — un pg_dump, JOINs reales). Migración 001: users (scrypt tal cual), actas (jsonb + índice ot), reviews. `SESSION_SECRET` propio (fuera `BLOB_READ_WRITE_TOKEN` como secreto y el fallback 'clave-insegura-de-respaldo'). ⚠️ CORRECCIÓN CRÍTICO: POST /api/forms QUEDA SIN AUTH en F1 (los técnicos no tienen credencial hasta F2) — mitigar con rate-limit + validación de payload + tamaño. POST /api/reviews SÍ se protege con la sesión admin existente (era escritura pública). Eliminar duplicado `web/api/` (byte-idéntico verificado).
- [ ] **F1.2 Export de blobs + deploy Coolify:** `scripts/export-blob.mjs` idempotente (forms/*, admin_auth/*, reviews/* → seed DB). App Coolify `ge-actas` (volumen `actas-data:/data`, envs SESSION_SECRET/DATABASE_URL/DEFAULT_TENANT). Verificar: health 200 en el dominio sslip, login admin migrado, panel lista actas históricas.
- [ ] **F1.3 Cutover DNS + smoke:** record A `actas → 2.24.83.195` vía cPanel API (patrón electroscan). Vercel vivo 1 semana como respaldo (NO revocar blob token — F8). Smoke: acta completa en móvil real → resumen en /admin; GPS y firma operativos. Re-correr export-blob para lo que entró durante el TTL.

## F2 — Persistencia completa (mata la queja del cliente)

- [ ] **F2.1 Migración full + OT de servidor:** migración 002 (actas extendida estilo api-local: uuid, estado borrador→firmada→enviada→cerrada; `acta_fotos` {slot, path, tomada_at, gps, inspection_id?, finding_ids[]}; `acta_checklist`; `acta_materiales`; secuencia `ot_seq`). `POST /api/actas` devuelve OT-{seq} (mata el aleatorio de main.js:initOTNumber y las colisiones).
- [ ] **F2.2 Autosave server + subida de fotos:** `autosave.js` → PUT draft con debounce (localStorage queda de caché). ⚠️ CORRECCIÓN CRÍTICO: subir el archivo ORIGINAL `input.files[0]` (el canvas 1000px q0.7 de images.js BORRA el EXIF probatorio y degrada OCR) — el base64 comprimido solo para preview/PDF. POST /api/actas/:id/fotos multipart → /data/uploads + fila acta_fotos.
- [ ] **F2.3 Firma + PDF archivado:** POST firma (PNG+timestamp+gps) al confirmar; pdf-generator sube también el PDF generado. Borrar código muerto web/js/api.js.
- [ ] **F2.4 Cola offline con IndexedDB:** ⚠️ CORRECCIÓN CRÍTICO: localStorage no alcanza (~5MB) — cola de fotos/PDF pendientes en IndexedDB con reintentos al volver la señal. El PDF client-side sigue funcionando SIEMPRE (fallback).
- [ ] **F2.5 PIN de técnico + cierre del anónimo (MISMO deploy):** usuarios técnico (rol) creados desde el panel admin, pantalla PIN 4-6 dígitos con sesión larga. ⚠️ En ESTE deploy (no antes): POST/PUT de actas exigen token, CORS cerrado al dominio. Comunicar PINs antes de deployar.
- [ ] **F2.6 Panel admin con evidencia + verificación móvil e2e:** /admin muestra fotos y firma reales. E2E: media acta + 2 fotos + firma → matar navegador → restaura del server; 2 técnicos simultáneos → 2 OTs sin pisarse; modo avión → encola y sube.

## F3 — El motor en la foto (diagnóstico sugerido dentro del acta)

- [ ] **F3.1 Service token scoped + proxy:** `MOTOR_SERVICE_TOKEN` en ElectroScan para POST /api/inspections, GET events, PATCH review. ⚠️ CORRECCIÓN CRÍTICO: scoped a organization y el proxy valida que el finding pertenezca a la inspección vinculada al acta (review/route.ts hoy actualiza por id sin tenant-check). En ge-actas: `routes/diagnostico.js`. ⚠️ **UNA inspección del motor POR DIAGNÓSTICO (por foto/lote marcado), NUNCA por OT** — el pipeline es destructivo (DELETE findings al re-correr, pipeline.ts:136 — destruiría goldenLabels) y cacheado (markers F2/F3 con targetKey '-' → fotos nuevas jamás generan hallazgos). Vínculo: `acta_fotos.inspection_id` (no actas.inspection_id). El proxy crea la inspección CON la foto en el multipart (attach posterior no existe) y `siteName` = nombre canónico del CLIENTE (no la dirección texto libre → evita sedes basura).
- [ ] **F3.2 UI card de diagnóstico:** botón "Diagnosticar con IA" por slot de foto (bajo demanda). ⚠️ Latencia real: dispatch por cron 1 min + pipeline 15-25s + retries → card persistente "Analizando (puede tardar 1-2 min)" y el técnico sigue llenando el acta; degradación elegante si el motor no responde. Polling 3s a events (proxy). Card: NC sugerida + severidad + cita normativa + confianza.
- [ ] **F3.3 Confirmación + aprendizaje + presupuesto:** "Usar en diagnóstico" (concatena a field-diagnostico + marca checklist correspondiente) y "Confirmar/Corregir" → proxy PATCH review → alimenta el aprendizaje en caliente ya construido. ⚠️ Recalcular caps: sin amortización de markers, acta de 10 fotos ≈ 10 corridas (~$0.5-2) — revisar PIPELINE_DAILY_CAP_USD=20 y definir fallo visible "presupuesto agotado, diagnóstico manual". E2E completo con foto real.

## F4 — Entidad Activo (hoja de vida)

- [ ] **F4.1 Migración assets + CRUD:** en ElectroScan: tabla `assets` (org, site, codigo TB-01/AC-01/TR-01/SPT-01, tipo, ubicacion, specs jsonb, current_status) + FK `asset_id` NULLABLE en findings y hdv_measurements. Semáforo `current_status` SOLO de findings REVISADOS (mapping canónico NC→rojo, D/S→ámbar, C→verde, definido UNA vez).
- [ ] **F4.2 Selector en acta + timeline + curaduría:** selector sede+activo con "crear al vuelo" en bloque 01 del acta. `GET /api/assets/:id/timeline` (actas por activo_id + findings+citas + mediciones con expiresAt — JOIN real gracias al schema compartido). ⚠️ CORRECCIÓN CRÍTICO: la curaduría del panel incluye MERGE de sites duplicados creados en F3. E2E: 2 actas al mismo activo → timeline con 2 intervenciones y semáforo actualizado.

## F5 — Portal del Cliente v1 (read-only, token por sede)

- [ ] **F5.1 Tokens de portal + ruta:** tabla portal_tokens (siteId, token opaco, expiración, revocable, lastAccessAt) + `/p/{token}` pública. Generación desde el panel.
- [ ] **F5.2 Dashboard del portal:** según `prototipo-portal-cliente-GE_1.html` PODADO (sin cifras COP — decisión #7): gauge % en norma, stat cards, alarmas R/A, tabla activos con semáforo. ⚠️ CORRECCIÓN CRÍTICO (regla dura): el filtro es `goldenLabel='correcto'` — high_confidence SIN revisar NO se muestra hasta que el gate auto_accept se active; gauge con query NUEVA filtrada (getSiteScores cuenta NC crudos — no usarlo tal cual).
- [ ] **F5.3 Drawer hoja de vida + informe filtrado:** timeline por activo. ⚠️ CORRECCIÓN CRÍTICO: el link al PDF NO reutiliza /r/{token} crudo (buildReportData trae TODOS los findings) — variante "cliente" del renderer con filtro por review. E2E: token → móvil → gauge/tabla reales → drawer → revocar → 404.

## F6 — Portal v2: acciones

- [ ] **F6.1 service_requests + POST portal:** migración (tipo normalizacion|certificacion, origen_token, findingId?, estado) + botones "Solicitar" rate-limited + bandeja en panel.
- [ ] **F6.2 Agenda + notificación:** scheduled_visits (programa GE, cliente read-only; sugerencias desde hdv_measurements.expiresAt) + email a GE vía webhook n8n (patrón n8n-lead-capture). E2E completo.

## F7 — Centro de Control interno v1 (leads de normalización)

- [ ] **F7.1 Vista /panel/control:** leads = findings NC con `goldenLabel='correcto'` (NUNCA sin revisar) agrupados por cliente/sede, prioridad por severidad; feed de alarmas (NC revisados + vencimientos getAlerts, etiquetado honesto); tabla clientes con conformidad de la MISMA query filtrada de F5. Sin MRR/planes/COP (decisión #7). Referencia: `prototipo-centro-control-GE.html` podado.
- [ ] **F7.2 work_orders:** migración (findingId, siteId, assetId, tecnico, estado creada→asignada→ejecutada→cerrada + `tipo_cierre` S|D). ⚠️ CORRECCIÓN CRÍTICO: el cierre vive en work_orders — NUNCA mutar findings.estado (reescribiría informes /r/{token} ya entregados = valor probatorio). Conformidad/leads restan findings con work_order cerrada.
- [ ] **F7.3 Cierre e2e con portal:** NC confirmado → lead hot → asignar → cerrar work_order tipo S → lead sale del funnel → semáforo del activo en portal pasa a ámbar/verde → conformidad sube.

## F8 — Endurecimiento y cierre

- [ ] **F8.1 Apagar Vercel + backups:** re-export final de blobs → revocar BLOB_READ_WRITE_TOKEN → archivar proyecto Vercel. Cron pg_dump (schema actas + motor) + tar /data/uploads; PRUEBA de restore real.
- [ ] **F8.2 Seguridad + MCP + docs:** CORS definitivo, rate limits públicos, helmet, rotaciones (Coolify, OpenRouter, cPanel viejo — ya marcadas en memoria), cerrar /api/reviews si quedó de F1. MCP re-apuntado a la API real (hoy huérfano contra api-local). Retirar api-local/ y tunnel-keep-alive.sh como referencia histórica. README de operación + ADR "un motor, varias puertas".

## Decisiones abiertas (Adrián debe confirmar — mientras tanto se usa la recomendación ✓)

1. **Dominio (F1):** ✓ mantener `actas.gestioneselectricas.com` con cutover A→VPS vía cPanel.
2. **Storage fotos/PDF (F2):** ✓ volumen `/data/uploads` (tar respaldable); MinIO solo si multi-nodo.
3. **DB del acta (F1):** ✓ schema `actas` en el MISMO Postgres del motor (precisión del crítico: schemas, no databases).
4. **Auth portal cliente (F5):** ✓ token opaco por sede (magic link); login better-auth solo si aparece multi-usuario.
5. **Auth técnicos (F2):** ✓ PIN 4-6 dígitos con sesión larga.
6. **Disparo del diagnóstico (F3):** ✓ bajo demanda por botón. Falta: presupuesto mensual LLM aceptable para GE.
7. **Cifras económicas (F5/F7):** ✓ FUERA del MVP hasta catálogo de precios curado por Wilman (riesgo legal si las alucina el LLM).
8. **Acta vs informe (F4):** ¿convergen en un documento o siguen siendo dos artefactos vinculados? (afecta drawer del portal).
9. **Inventario de activos (F4):** ✓ creación al vuelo desde el acta + curaduría/merge en panel.
10. **Rotaciones (F8, cuanto antes):** token Coolify, key OpenRouter, token cPanel viejo.
11. **Política de re-diagnóstico (F3):** ✓ re-tomar foto ya diagnosticada = nueva inspección; el vínculo del acta apunta a la última, las anteriores quedan de historial.

## Bitácora de iteraciones
<!-- [fecha hora] Fx.y — resultado, commit, verificación -->
- [2026-07-19 ~01:50] F1.1 HECHA (commit 2962eee): apps/actas/ Express+pg con contratos idénticos a Vercel; schema `actas` en el Postgres del motor (migración 001 aplicada); SESSION_SECRET fail-fast; POST forms sin auth+rate-limit (corrección crítico), POST reviews ahora con sesión; Dockerfile alpine sin builds nativos; web/api/ duplicado eliminado. VERIFICADO e2e contra el Postgres real vía túnel SSH: health db:true, upsert atómico preservando created_at, 401s correctos, estáticos 200. Fila de prueba borrada, túnel cerrado. Siguiente: F1.2 export de blobs + deploy Coolify.
- [2026-07-19 ~02:15] CORRECCIÓN de diagnóstico (F1.2): el "prod roto" fue FALSA ALARMA — el project root de Vercel es `web/` → el FORM vive en `/` (raíz, title "Acta Técnica Digital") y el admin en `/admin.html`; `/actas`, `/admin` y `/api/health` NUNCA existieron en el deploy vivo (los rewrites del vercel.json de la RAÍZ no aplican). Las functions vivas = web/api/{auth,forms} y los push a GitHub NO auto-promueven a producción (web/api borrado en F1.1 y aún responden) — hotfix 2dde595 las restauró igual como defensa hasta el cutover. **Salud del acta de ahora en más: GET / (title Acta) + /api/auth {initialized:true}.**
