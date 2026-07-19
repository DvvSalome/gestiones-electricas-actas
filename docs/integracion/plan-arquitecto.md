# plan-arquitecto

## Resumen
Plan de 8 fases para llevar el Acta Digital al VPS Coolify del cliente (2.24.83.195) persistiendo TODO el dato (fotos, firma, checklist, materiales) en Postgres, conectar el Motor RETIE de ElectroScan 360 en el paso de la foto (hallazgo sugerido + confirmación del técnico que alimenta el aprendizaje), crear la entidad Activo compartida que habilita la hoja de vida, y sobre esa base montar el Portal del Cliente (token opaco /p/{token}, reutilizando el patrón /r/{token}) y el Centro de Control interno (leads = findings NC revisados). Cada fase es deployable y verificable e2e por sí sola, ejecutable en 2-3 iteraciones de ~30 min; nada del acta se reescribe — se porta, se refuerza y se conecta. Se reutiliza todo lo ya construido en ElectroScan: schema Drizzle, RAG RETIE/RETILAP, validador de citas, informes, aprendizaje en caliente, patrón de tokens de acceso y el tema claro/oscuro con tokens lima/navy.

## Hallazgos clave
- El orden correcto es: F1 paridad en VPS + migración de blobs + cutover DNS (destranca la dependencia de Vercel sin tocar comportamiento) -> F2 persistencia completa (mata la queja del cliente: fotos/firma/checklist al servidor en el momento de captura, OT secuencial, autosave server-side) -> F3 motor en la foto (proxy /api/diagnostico con service token + polling, nunca browser->motor directo) -> F4 activos -> F5/F6 portal -> F7 centro de control -> F8 endurecimiento.
- La tabla assets debe vivir en el Postgres de ElectroScan (packages/core/src/schema.ts), no en la DB de actas: findings y hdv_measurements ya viven ahi y la hoja de vida es un JOIN; el acta solo guarda activo_id. Sin esta decision temprana (F4) el portal y el centro de control no tienen entidad central.
- El punto de intercepcion del motor es handleImageUpload() en web/js/images.js (foto ya comprimida a 1000px JPEG base64): boton 'Diagnosticar con IA' bajo demanda (no automatico) para controlar costo LLM (~$0.05-0.21/corrida), con tope de 10 fotos/acta ya existente en la UI.
- La confirmacion del tecnico en el acta cierra el bucle de aprendizaje del motor gratis: PATCH /api/findings/{id}/review ya existe y alimenta el gate auto_accepted (50 etiquetas, >=90% precision) — el acta se convierte en la fuente principal de etiquetas doradas.
- El portal cliente reutiliza el patron report_access_tokens elevado a sede (portal_access_tokens con siteId, expirable/revocable) en ruta /p/{token}; solo muestra findings con gate aprobado/revisado, nunca crudos del pipeline. Login better-auth rol client queda como fase 2 opcional.
- Tres arreglos de seguridad son bloqueantes de F1/F2, no opcionales: SESSION_SECRET propio (hoy firma con BLOB_READ_WRITE_TOKEN y fallback hardcodeado), POST /api/forms autenticado (hoy escritura publica anonima con upsert por OT que pisa registros), y OT secuencial de servidor (hoy aleatorio en cliente, colisionable).
- Los valores COP (multas, sobrecostos, valor de leads) quedan FUERA del MVP del portal y del centro de control hasta que Wilman entregue un catalogo de precios curado — riesgo legal de cifras alucinadas si las genera el LLM. El centro de control v1 muestra leads sin monto.
- El script de export de Vercel Blob (forms/gestiones-electricas*.json, admin_auth/*, reviews/*) debe correr ANTES del cutover DNS con el token vigente: los blobs son la unica copia de las actas historicas y de los usuarios del panel.

## Riesgos
- Perdida de datos historicos si el cutover DNS se hace antes de exportar los blobs de Vercel o si se revoca BLOB_READ_WRITE_TOKEN antes de F8 (el token ademas firma las sesiones actuales del panel).
- Costo LLM descontrolado si el diagnostico se dispara automatico por foto en vez de bajo demanda; multiplicado por 10 fotos/acta y varios tecnicos concurrentes.
- Exponer hallazgos no revisados al cliente final en el portal romperia el release gate del motor (todo entra como needs_review) y compromete la credibilidad juridica del acta; el filtro por gate es regla dura en F5.
- Conflicto de rol en F7: el mismo sistema que certifica conformidad genera leads comerciales — separar el informe probatorio del pipeline comercial (lead solo post-validacion del ingeniero) o GE compromete la imparcialidad del acta.
- Scope creep: planes/MRR/billing, telemetria 'tiempo real', y cotizador integrado NO estan en estas 8 fases; son decisiones de producto de Wilman posteriores. Meterlas ahora atrasa lo que destranca al cliente.
- Los tecnicos trabajan en zonas con mala senal: si F2 no incluye cola offline de subida (reintentos) la persistencia server-side puede fallar silenciosamente en terreno; el PDF client-side debe seguir funcionando como fallback siempre.
- Concurrencia en la migracion: mientras Vercel siga vivo como respaldo post-cutover, cualquier acta guardada contra el deployment viejo (DNS cacheado) queda huerfana — mantener el export re-ejecutable e idempotente durante la semana de gracia.

## Detalle
# Plan por fases — Acta Digital ↔ ElectroScan 360 (Gestiones Eléctricas)

Ejecutable por agente en loop de iteraciones de ~30 min. Cada fase termina deployada y verificada e2e. Repos: acta = `D:/TRABAJOS PROPIOS/projects/gestiones-electricas-actas`, motor = `D:/TRABAJOS PROPIOS/projects/electroscan360`. VPS destino: Coolify `2.24.83.195` (donde ya vive ElectroScan). Principio rector de los pizarrones: "El Acta recoge. El Motor diagnostica." — el motor entra DENTRO del acta en el paso de la foto; el PDF es lo que se lleva el cliente, los datos son la empresa.

---

## F1 — Acta viva en el VPS (paridad + migración de datos + cutover)

**Objetivo:** el acta corre en el Coolify del cliente con comportamiento idéntico al de Vercel, con las actas históricas y usuarios del panel migrados, y el DNS apuntando al VPS. Cero cambios funcionales visibles.

**Entregables:**
- `apps/actas/` nuevo en el repo del acta: `server.js` (Express: `express.static('web')` + rutas), `Dockerfile` (node:20-alpine, HEALTHCHECK a `/api/health`), `.dockerignore` (excluir `web/publicidad/*.mp4` — ya existe el proxy `/api/media` a Supabase).
- Port mecánico de las 5 funciones `api/*.js` a `src/routes/{auth,forms,health,media,reviews}.js` (firma `(req,res)` es casi 1:1 con Express). Eliminar el duplicado `web/api/` (copias byte-idénticas verificadas).
- Storage: Postgres — DB `actas` nueva en la instancia Postgres que ya corre ElectroScan en Coolify. Migración `001_init.sql`: tablas `users` (scrypt+salt, se importan tal cual), `actas` (el JSON resumen actual, columna jsonb + índice por ot), `reviews`. El hack `addRandomSuffix` anti-caché CDN desaparece (era workaround de Vercel).
- `SESSION_SECRET` nuevo como clave HMAC (reemplaza `BLOB_READ_WRITE_TOKEN`; eliminar el fallback `'clave-insegura-de-respaldo'`). TTL 12h se mantiene: un re-login y listo.
- `scripts/export-blob.mjs` (one-shot, idempotente, re-ejecutable): con el token vigente, `list()` + fetch de `forms/gestiones-electricas*`, `admin_auth/*`, `reviews/*` → seed de la DB.
- Rutas equivalentes a los rewrites de `vercel.json`: `/actas`→`web/index.html`, `/admin`→`web/admin.html`, `/`→`/publicidad`.
- Coolify Application `ge-actas`: dominio `actas.gestioneselectricas.com`, volumen `actas-data:/data`, envs `SESSION_SECRET`, `DATABASE_URL`, `DEFAULT_TENANT=gestiones-electricas`. TLS lo emite Traefik/Coolify.
- Cutover: record A `actas → 2.24.83.195` vía cPanel API (patrón ya probado con `electroscan`). Vercel queda vivo 1 semana como respaldo; NO revocar el token de Blob todavía (F8).

**Verificación e2e:** (1) `curl https://actas.gestioneselectricas.com/api/health` responde; (2) login admin con usuario migrado funciona; (3) el panel `/admin` lista las actas históricas migradas; (4) llenar un acta en móvil real y "Descargar PDF" → el resumen aparece en `/admin`; (5) el formulario `/actas` carga con GPS y firma operativos.

**Riesgos:** blobs no exportados antes del cutover (actas perdidas); DNS cacheado mandando técnicos al Vercel viejo durante TTL (mantener export re-ejecutable); better/pg nativo en alpine (usar `pg` puro, sin compilación).

**Iteraciones estimadas:** 3 (port+DB / export+deploy / cutover+smoke).

---

## F2 — Persistencia completa: el acta deja de perder datos (mata la queja)

**Objetivo:** fotos, firma, checklist, materiales, norma y PDF llegan al servidor EN EL MOMENTO de la captura, no solo dentro del PDF. Recargar la página no pierde nada. Es la fase que resuelve el fallo estructural señalado por el cliente ("genera PDF y resetea").

**Entregables:**
- Migración `002_full_acta.sql`: tabla `actas` extendida (esquema inspirado en `api-local/src/db/database.js` que ya lo tenía más rico: uuid, firma, gps numérico, estado borrador→firmada→enviada→cerrada, calificación) + tablas `acta_fotos` (`{acta_id, slot, path, tomada_at, gps, inspection_id?, finding_ids[]}`), `acta_checklist` (8 ítems, estado ok/fail/neutral), `acta_materiales`, secuencia `ot_seq` por tenant.
- OT secuencial de servidor: `POST /api/actas` devuelve `OT-{seq}` (reemplaza el aleatorio de `web/js/main.js:initOTNumber`; el campo readonly se llena del server). Fin de las colisiones y del upsert destructivo.
- Autosave server-side: `web/js/autosave.js` además de localStorage hace `PUT /api/actas/:id/draft` con debounce (texto+checklist+materiales). localStorage queda como caché offline.
- Subida de fotos en captura: `handleImageUpload()` (`web/js/images.js`) tras comprimir hace `POST /api/actas/:id/fotos` (multipart o base64) → disco `/data/uploads/` + fila en `acta_fotos`. Cola con reintentos si no hay señal (el PDF client-side sigue funcionando como fallback SIEMPRE).
- Firma: al "Confirmar Firma" (`signature.js`) → `POST /api/actas/:id/firma` (PNG + timestamp + gps). Se elimina el código muerto `web/js/api.js` (saveActaToAPI, solo-localhost).
- PDF archivado: tras generar, `saveFormDataToBackend()` (`web/js/pdf-generator.js`) sube también el blob PDF → `/data/uploads/pdf/`.
- Auth mínima de técnico: pantalla PIN (usuarios técnico en tabla `users` con rol; el admin los crea desde el panel que ya tiene CRUD). Todo POST/PUT de actas exige token de técnico; se cierra la escritura pública anónima. CORS cerrado al dominio propio.
- Panel `/admin`: el "PDF resumen" ahora muestra fotos y firma reales (desaparece la nota "la evidencia quedó en el PDF original").

**Verificación e2e:** (1) llenar media acta con 2 fotos y firma en el móvil, matar el navegador, reabrir → todo se restaura desde el server; (2) dos técnicos con dos actas simultáneas → dos OT distintos, sin pisarse; (3) `/admin` muestra las fotos y la firma del acta; (4) POST anónimo sin token → 401; (5) modo avión durante la foto → se encola y sube al volver la señal.

**Riesgos:** UX de PIN en terreno (mantenerlo de 4-6 dígitos, sesión larga en el dispositivo); crecimiento de `/data/uploads` (rotación/limits en F8); regresión del flujo PDF (no tocar `pdf-generator.js` salvo el hook de subida).

**Iteraciones estimadas:** 3 (migración+OT+autosave / fotos+firma+PDF / PIN+verificación en móvil).

---

## F3 — El motor en la foto: diagnóstico sugerido dentro del acta

**Objetivo:** el flujo de los pizarrones: técnico toma la foto → el motor sugiere hallazgo con artículo RETIE/RETILAP citado → el técnico confirma o corrige → eso alimenta el aprendizaje del motor. Una sola herramienta en terreno.

**Entregables:**
- En ElectroScan: `MOTOR_SERVICE_TOKEN` (service token servidor-a-servidor) aceptado por `POST /api/inspections`, `GET /api/inspections/:id/events`, `PATCH /api/findings/:id/review`. Nunca browser→motor directo.
- En ge-actas: `src/routes/diagnostico.js` — `POST /api/diagnostico` `{acta_id, foto_id, checklist_context}`: crea (o reutiliza) la inspección de esa OT en el motor, adjunta la foto ya persistida en F2, dispara el pipeline (worker pg-boss + MoE + RAG 1030 chunks + validador determinista de citas, todo ya construido). `GET /api/diagnostico/:id` proxyea los events del motor.
- Frontend: botón "Diagnosticar con IA" bajo cada slot de foto (bajo demanda, NO automático — control de costo ~$0.05-0.21/corrida; tope 10 fotos/acta ya existe). Polling cada 3s (patrón ya validado en el motor; SSE descartado por el proxy de Coolify). Card de hallazgo sugerido: título NC + severidad + cita normativa + confianza.
- Acciones del técnico en la card: "Usar en diagnóstico" (concatena a `field-diagnostico` y marca el ítem de checklist correspondiente en Falla — mapeo natural checklist 8 ítems ↔ categorías de hallazgo) y "Confirmar/Corregir" → proxy a `PATCH /api/findings/{id}/review` → alimenta el gate `auto_accepted` (50 etiquetas, ≥90%) del aprendizaje en caliente.
- Persistir vínculo: `actas.inspection_id` + `acta_fotos.finding_ids[]` (la semilla de la hoja de vida en F4).

**Verificación e2e:** foto real de tablero sin barraje → card con NC sugerida citando artículo RETIE verificable en el corpus → "Usar en diagnóstico" prellena el textarea y marca checklist → "Confirmar" → el finding aparece revisado en el panel del motor y `inspection_id` queda en la fila del acta. Verificar también el camino de error: motor caído → el acta sigue funcionando sin diagnóstico (degradación elegante).

**Riesgos:** costo si se vuelve automático (mantener bajo demanda); latencia del pipeline en terreno (mostrar estado "analizando..." y permitir seguir llenando el acta); acoplamiento — el acta JAMÁS debe requerir al motor para completarse.

**Iteraciones estimadas:** 3 (service token+proxy / UI card+polling / review+vínculo+e2e).

---

## F4 — Entidad Activo: nace la hoja de vida

**Objetivo:** persistencia por ACTIVO con ID único (TB-01, AC-01, TR-01, SPT-01...) e historial cross-inspección. Sin esto no hay hoja de vida, solo lista de actas.

**Entregables:**
- Migración Drizzle en ElectroScan (`packages/core/src/schema.ts`): tabla `assets` (`organizationId, siteId, codigo, nombre, tipo` [tablero|acometida|transformador|spt|general], `ubicacion, specs jsonb, current_status`) + FK `asset_id` NULLABLE en `findings` y `hdv_measurements` (las alarmas de ámbito "General" sin activo se permiten). **Decisión de arquitectura: assets vive en el Postgres del motor**, porque findings/mediciones ya están ahí y la hoja de vida es un JOIN; el acta solo referencia `activo_id`.
- `clientes`/`sites`: reutilizar `sites` existente (el edificio ~ un site de la org GE). El acta gana selector de sede+activo (con "crear activo al vuelo": código + tipo + ubicación) en el bloque 01, reemplazando gradualmente la dirección texto libre.
- Endpoint hoja de vida: `GET /api/assets/:id/timeline` — une actas (DB actas, por `activo_id`), findings + citas + cierres NC→D/S (`report-html.ts` ya define la semántica), y mediciones `hdv_measurements` con `expiresAt`.
- Semáforo: `current_status` derivado del último finding REVISADO por activo (mapping canónico: NC→No cumple/rojo; D,S→Pendiente/ámbar hasta verificación; C→Conforme/verde) + agregado por sede reutilizando la lógica de `getSiteScores()` (`dashboard.ts`).

**Verificación e2e:** crear activo TB-01 desde el acta en móvil → segunda acta al mismo activo con hallazgo confirmado (F3) → `GET /api/assets/:id/timeline` devuelve 2 intervenciones con fotos, hallazgo, cita y semáforo actualizado.

**Riesgos:** inventario nace vacío — decidir con GE si se pre-carga por sede o se crea al vuelo desde actas (recomendado: al vuelo + curaduría en panel); mapping NC|C|D|S ↔ semáforo debe canonizarse UNA vez y compartirse portal/panel.

**Iteraciones estimadas:** 2 (migración+CRUD / selector en acta+timeline+e2e).

---

## F5 — Portal del Cliente v1 (read-only, token por sede)

**Objetivo:** el administrador del edificio ve su semáforo, sus activos y la hoja de vida de cada uno, sin login. Prototipo de referencia: `prototipo-portal-cliente-GE_1.html` (corrigiendo sus bugs: gauge 72%≠8/12, fila TB-03 que abre tr01, "RETIE 2022" → citas reales de `corpus_chunks.refPath` edición 2026).

**Entregables:**
- Migración: `portal_access_tokens` (`token randomBytes, siteId, organizationId, contactEmail, expiresAt ~90d, revokedAt, lastAccessAt`) — el patrón `report_access_tokens` elevado de inspección a sede. Generación + revocación desde el panel; entrega por magic-link al `contactEmail` que ya se captura en inspections.
- Rutas en `apps/web/app/p/[token]/`: hero con gauge % real (conteos V/A/R desde `current_status`), stat cards, tabla "Mis activos" con semáforo, drawer hoja de vida (facts por tipo de activo desde `specs` jsonb + timeline de F4 con chip de norma desde `finding_citations`), link "Ver acta (PDF)" reutilizando `/r/{token}/pdf`.
- **Regla dura:** solo findings con gate aprobado/revisado — nunca crudos del pipeline. Sin montos COP en v1.
- Tema: tokens lima/navy claro/oscuro de Adrián ya existentes en ElectroScan (identidad GE, no FourG).

**Verificación e2e:** generar token de la sede de prueba desde el panel → abrir `/p/{token}` en móvil → gauge y tabla reflejan los datos reales sembrados en F3/F4 → drawer muestra timeline con cita normativa → link al PDF del informe funciona → token revocado → 404.

**Riesgos:** token de larga vida con datos de riesgo eléctrico (expiración+rotación+auditoría vía `lastAccessAt` obligatorias); fugas de findings needs_review si el filtro por gate se olvida en alguna query.

**Iteraciones estimadas:** 3 (tokens+ruta / UI dashboard / drawer+e2e).

---

## F6 — Portal del Cliente v2: acciones (normalización, agenda)

**Objetivo:** el portal deja de ser vitrina: el cliente solicita normalización/certificación y ve su agenda.

**Entregables:**
- Migración: `service_requests` (`siteId, assetId?, tipo` [normalizacion|certificacion], `origen_token, findingId?, estado` [nueva|contactada|convertida|descartada], timestamps) + `scheduled_visits` (`siteId, assetIds[], fecha, tipo_trabajo`) — la agenda la programa GE desde el panel, el cliente la ve read-only; los vencimientos de `hdv_measurements.expiresAt` alimentan sugerencias.
- Botones "Solicitar normalización" (por alarma/activo) y "Solicitar certificación" → `POST /api/portal/requests` (rate-limited por token; identidad implícita = contactEmail del token).
- Notificación a GE: fila en bandeja del panel + email vía webhook n8n (patrón n8n-lead-capture ya validado en otros clientes).

**Verificación e2e:** desde `/p/{token}` solicitar normalización de TB-01 → toast de confirmación → la solicitud aparece en la bandeja del panel con activo y finding vinculados → email llega al buzón de GE.

**Riesgos:** spam/abuso del endpoint público (rate limit + dedupe por finding); expectativa de SLA ("un técnico te contactará") — definir con GE quién atiende la bandeja.

**Iteraciones estimadas:** 2 (migración+POST+bandeja / agenda+notificación+e2e).

---

## F7 — Centro de Control interno v1: leads de normalización

**Objetivo:** vista interna para Wilman donde cada NC revisado es un lead accionable. Prototipo de referencia: `prototipo-centro-control-GE.html`, PODADO: sin MRR, sin planes, sin valores COP (decisiones de producto pendientes — ver decisiones abiertas).

**Entregables:**
- Vista `/panel/control`: (a) leads = findings estado NC **con revisión del ingeniero aprobada** (nunca sobre alucinaciones), agrupados por cliente/sede, prioridad hot/warm derivada de severidad; (b) feed de alarmas = mismos NC + vencimientos de `getAlerts()` existente (redefinido honestamente como "alertas de inspección y vencimientos", no "tiempo real"); (c) tabla clientes con conformidad % reutilizando `getSiteScores()` agregado por organización; (d) bandeja de `service_requests` de F6.
- Migración: `work_orders` mínima (`findingId/leadId, siteId, assetId, tecnico_userId NULLABLE, estado` [creada|asignada|ejecutada|cerrada], timestamps). Botón "Asignar" crea la orden; al documentar la corrección, el finding transiciona NC→S (cierre en sitio) o NC→D (cierre documental) — enums que YA existen en `report-html.ts` y en el structured output del pipeline — y el lead sale del funnel, subiendo la conformidad.
- Conexión futura (no en esta fase): valor del lead desde el skill `fourg-skills:gestiones-electricas-cotizacion` cuando exista catálogo de precios curado.

**Verificación e2e:** el NC confirmado en F3 aparece como lead hot en `/panel/control` → "Asignar" a un técnico → cerrar la work_order marcando cierre S → el finding pasa a S, el lead desaparece, el semáforo del activo en el portal (F5) pasa a ámbar/verde y la conformidad de la sede sube.

**Riesgos:** conflicto de rol certificador/vendedor — mantener la separación informe probatorio vs pipeline comercial (lead solo post-validación); tentación de meter billing/planes aquí (NO — es proyecto aparte).

**Iteraciones estimadas:** 3 (leads+alarmas / work_orders+asignación / cierre+e2e con portal).

---

## F8 — Endurecimiento y cierre de migración

**Objetivo:** apagar Vercel con seguridad, blindar y dejar operable.

**Entregables:**
- Re-export final de blobs (por si entró algo al deployment viejo durante la semana de gracia) → revocar `BLOB_READ_WRITE_TOKEN` → archivar el proyecto Vercel.
- Backups: cron `pg_dump` de las DB `actas` + motor y tar de `/data/uploads` a destino externo; prueba de restore real en staging.
- Seguridad: CORS definitivo, rate limits en endpoints públicos (`/p/*`, `/api/portal/*`), headers (helmet), rotación de secretos quemados (token Coolify y OpenRouter ya marcados para rotar en memoria del proyecto), auditoría de accesos de tokens de portal.
- MCP rescatado: `GE_API_URL=https://actas.gestioneselectricas.com` + endpoints `/api/actas` reales en ge-actas (el MCP `mcp/src/index.js` hoy apunta al api-local huérfano). Retirar `api-local/` y `tunnel-keep-alive.sh` (era LAN) del camino, dejándolos como referencia histórica.
- Documentación: README de operación (deploy, envs, backups, restore) + ADR corto de la arquitectura "un motor, varias puertas".

**Verificación e2e:** restore de backup en contenedor limpio reproduce panel+portal; escaneo de endpoints sin auth devuelve solo los públicos esperados; MCP lista actas reales de producción; Vercel apagado sin ninguna ruta rota.

**Iteraciones estimadas:** 2.

---

## Decisiones abiertas que Adrián debe confirmar (antes de la fase indicada)

1. **Dominio (antes de F1):** mantener `actas.gestioneselectricas.com` con cutover A→2.24.83.195 vía cPanel API (recomendado: patrón ya probado con electroscan) vs consolidar como ruta bajo electroscan. Recomendación: dominio propio — "un motor, varias puertas" pide puertas separadas.
2. **Storage de fotos/PDF (antes de F2):** volumen Docker `/data/uploads` (recomendado v1, simple, respaldable con tar) vs MinIO S3-compatible (si se prevé multi-nodo o mucho volumen). Los mp4 de publicidad siguen en Supabase vía el proxy existente.
3. **DB del acta (antes de F1):** DB `actas` separada en el mismo Postgres del motor (recomendado: un solo backup, un solo servidor, JOINs posibles vía FDW o app-level) vs SQLite en volumen. Recomendación fuerte: Postgres.
4. **Auth del portal cliente (antes de F5):** token opaco por sede con magic-link (recomendado, cero fricción, patrón ya probado) vs login better-auth rol `client` desde el día 1. Recomendación: token v1, login solo si aparece multi-usuario/multi-sede.
5. **Auth de técnicos (antes de F2):** PIN corto por técnico (recomendado para terreno) vs usuario/contraseña completo.
6. **Disparo del diagnóstico IA (antes de F3):** bajo demanda por botón (recomendado, controla costo) vs automático en cada foto. Y presupuesto mensual de LLM aceptable para GE.
7. **Cifras económicas (antes de F5/F7):** confirmar que quedan fuera del MVP hasta catálogo de precios curado por Wilman (multas RETIE, sobrecostos, valor de leads). Riesgo legal si las alucina el LLM.
8. **Naming acta vs informe (antes de F4):** ¿el "acta" del técnico y el "informe" del motor (`/r/{token}/pdf`) convergen en un solo documento o siguen siendo dos artefactos vinculados? Afecta el drawer del portal y el naming de entidades.
9. **Origen del inventario de activos (antes de F4):** creación al vuelo desde el acta con curaduría en panel (recomendado) vs carga manual previa por GE.
10. **Rotaciones pendientes que tocan este plan (F8, pero cuanto antes):** token Coolify quemado, key OpenRouter quemada, y revocar el token viejo de cPanel hardcodeado en deploy-cpanel.sh.
