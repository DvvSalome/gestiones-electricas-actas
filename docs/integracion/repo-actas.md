# repo-actas

## Resumen
El "Acta Digital" es un sitio estático (web/index.html, ~2.000 líneas, mobile-first) + 5 funciones serverless de Vercel que persisten en Vercel Blob como archivos JSON por tenant. El acta NO persiste como dato completo: fotos, firma, checklist y materiales viven solo en memoria del navegador y terminan únicamente dentro del PDF generado client-side (html2canvas+jsPDF); al backend solo llega un resumen plano (POST /api/forms, sin auth, upsert por OT que pisa registros) y solo si el técnico llega a pulsar "Descargar PDF". api-local/ es la API Express+SQLite de la era LAN (esquema de actas más rico pero desalineado con el formulario actual: no tiene /api/forms ni /api/auth) y mcp/ envuelve esa API local (9 tools), por lo que hoy en prod el MCP está huérfano. Migrar a VPS Coolify es directo: un solo contenedor Node 20/Express que sirva web/ estático + las 5 rutas porteadas de Blob→Postgres (compartiendo la instancia del Motor RETIE en 2.24.83.195) o SQLite en volumen, con dominio actas.gestioneselectricas.com vía Traefik de Coolify. El punto de conexión con ElectroScan 360 es handleImageUpload() en web/js/images.js: foto → POST al motor → polling de eventos (patrón ya validado en el motor) → hallazgo sugerido prellenando diagnóstico/checklist → confirmación vía PATCH /api/findings/{id}/review.

## Hallazgos clave
- PÉRDIDA DE DATOS (queja del cliente confirmada): las fotos (base64 en window.imagesInMemory), la firma (canvas dataURL), el checklist de 8 ítems, los materiales y la norma NUNCA se envían al backend. saveFormDataToBackend() (web/js/pdf-generator.js:290) solo manda un resumen (ot, cliente, contacto, técnico, tensión, corriente, diagnóstico, acciones, firmante, firmado:bool, num_fotos:CONTEO, gps:string, estado_final) y SOLO se dispara si el técnico genera el PDF. Si recarga la página antes, las fotos y la firma se pierden (localStorage guarda solo texto).
- POST /api/forms NO tiene autenticación y hace upsert por OT sobre un único JSON array en Vercel Blob (forms/<tenant>.json, access:'public'): cualquiera puede inyectar o SOBREESCRIBIR actas, dos técnicos concurrentes se pisan (read-modify-write sin lock, last-write-wins), y el upsert por OT destruye historial. El OT además se genera ALEATORIO en el cliente (OT-1000..9999, main.js:initOTNumber) → colisiones garantizadas entre celulares.
- Los técnicos NO se loguean: /actas es pública y la identidad es un campo de texto libre 'Técnico Asignado'. Solo el panel /admin tiene login real (usuarios scrypt+salt en blob admin_auth/<tenant>.json, token HMAC-SHA256 12h firmado usando BLOB_READ_WRITE_TOKEN como secreto, con fallback inseguro 'clave-insegura-de-respaldo' si falta la env).
- api-local/ NO es un port deployable del backend actual: es la API previa (Express 5 + better-sqlite3, puerto 3001) con esquema de actas más rico (UUID, firma base64, calificación, estados borrador/firmado/enviado, gps numérico) pero SIN /api/forms, SIN /api/auth, con rutas de assets apuntando a carpetas del Mac del dev, y con un payload distinto al que envía el formulario en prod. web/js/api.js (saveActaToAPI) está muerto en prod: solo corre en localhost y referencia IDs de DOM inexistentes (header-ot, gps-lat).
- mcp/src/index.js expone 9 tools (list/get/set_video_review, get_review_report, list_images, list/get/create_acta, get_stats) pero contra GE_API_URL=localhost:3001 (api-local), no contra las funciones Vercel → hoy en producción el MCP no ve las actas reales.
- Dependencias duras de Vercel: @vercel/blob + env BLOB_READ_WRITE_TOKEN (que además dobla como secreto de sesión), los rewrites de vercel.json (/→/publicidad, /actas→web/index.html, /admin→web/admin.html, /js|/css|/images), la firma de handler serverless (portable a Express casi 1:1) y el hack de versionado con addRandomSuffix para esquivar el caché stale del CDN (innecesario en VPS). api/media.js es solo un proxy con Range a Supabase Storage (bucket publicidad, proyecto aoglarmebyimcygdrnxo) para el revisor de videos.
- Punto de integración con el Motor RETIE: handleImageUpload() en web/js/images.js (foto → compressImage 1000px JPEG q0.7 → base64). Ahí se intercepta para enviar la foto a ElectroScan 360 (VPS Coolify 2.24.83.195, electroscan.gestioneselectricas.com, Next.js + worker pg-boss + Postgres). El motor ya tiene el patrón: polling 3s a GET /api/inspections/:id/events (SSE descartado por el proxy de Coolify) y PATCH /api/findings/{id}/review para aprobar/ajustar el hallazgo — exactamente el flujo 'foto → hallazgo sugerido → confirma' de la guía.
- web/api/auth.js y web/api/forms.js son copias byte-idénticas de api/auth.js y api/forms.js (verificado con diff) — el project root de Vercel ha oscilado entre la raíz y web/; en la migración basta un solo juego de rutas.
- Lo que hoy estructura el acta (JSON en forms/<tenant>.json) vs lo que falta para la hoja de vida del activo: faltan fotos como archivos con metadata por slot (antes/después/detalle/extras), firma, checklist por ítem, materiales, norma, PDF archivado, un ID estable de activo/sede (hoy solo dirección texto libre), OT secuencial de servidor, versionado/historial, lat/lng numéricos, calificación, vínculo inspection_id/findings del motor, y usuario autenticado creador.

## Riesgos
- Escritura pública sin auth en /api/forms: cualquier tercero con la URL puede crear o sobreescribir actas del cliente (integridad legal del acta comprometida).
- Carrera last-write-wins sobre el blob único de actas: dos técnicos guardando a la vez pueden borrar el acta del otro silenciosamente; con el equipo creciendo la probabilidad sube.
- Colisión de OT aleatorios generados en el cliente + upsert por OT: un técnico puede pisar el acta de otro sin querer al coincidir el número.
- Evidencia probatoria (fotos, firma, checklist) existe SOLO en el PDF que el técnico descarga a su celular; si no lo comparte o lo borra, la empresa no tiene respaldo — migrar sin resolver esto reproduce la queja del cliente.
- BLOB_READ_WRITE_TOKEN como secreto de firma de sesiones: al migrar y retirar Vercel Blob hay que introducir SESSION_SECRET propio ANTES de invalidar el token, o todas las sesiones/logins del panel quedan rotos o inseguros (fallback hardcodeado 'clave-insegura-de-respaldo').
- Migración de datos: hay que exportar los blobs actuales (forms/gestiones-electricas*.json y admin_auth/*) con el token vigente antes del cutover de DNS, o se pierden las actas históricas y los usuarios del panel.
- Los mp4 de web/publicidad/ (~cientos de MB) están en el repo/carpeta web; empaquetarlos en la imagen Docker infla builds — excluirlos (ya hay proxy a Supabase via /api/media) o moverlos a volumen/MinIO.
- Integración con el motor sin control de costos: cada foto dispara LLM (~$0.05-0.21/corrida según la bitácora de ElectroScan); hay que respetar el tope de 10 fotos y decidir si el análisis es por foto o por acta para no multiplicar el gasto.
- Autenticación cruzada actas↔motor pendiente: el motor usa better-auth; el acta no tiene login de técnicos — se necesita un service token servidor-a-servidor (nunca llamar al motor directo desde el browser con credenciales expuestas).
- CORS actual es '*' en todas las funciones; al poner auth real de técnicos hay que cerrarlo al dominio propio.

## Detalle
# Auditoría técnica — repo `gestiones-electricas-actas` (Acta Digital GE)

Repo: `D:/TRABAJOS PROPIOS/projects/gestiones-electricas-actas` · remote `FOURGSOLUTIONS-FGS/gestiones-electricas-actas` · deploy actual: Vercel → `actas.gestioneselectricas.com`.

---

## 1. Arquitectura real

### 1.1 `web/` — el formulario del acta

**`web/index.html`** (2.066 líneas, página única mobile-first, max-width 480px, paleta lima `#C7E52F`/carbón — la misma marca que ya usa ElectroScan). Estructura en 5 bloques + envío:

| Bloque | Campos (IDs) |
|---|---|
| 01 Identificación | `field-ot` (readonly, generado en cliente), `field-servicio-tipo` (Correctivo/Preventivo/Diagnóstico/Instalación), `field-cliente`, `field-direccion`, `field-telefono`, `field-email`, `field-tecnico`, `field-matricula` (CONTE/RETIE) |
| 02 Checklist | 8 ítems fijos con ciclo tap Conforme→Falla→Neutral (`checklist.js`): tablero, breakers, acometida/medidores, conductores, SPT, tomacorrientes/GFCI, iluminación, señalización + `field-diagnostico` (textarea), `field-tension`, `field-corriente` |
| 03 Acciones y materiales | `field-acciones` (textarea), `field-norma` (RETIE/NTC2050/RETILAP/N.A.), tabla dinámica de materiales (desc/cant/ref), radio `operacion-final` (si/parcial/no) |
| 04 Evidencia fotográfica | 4 slots fijos (`img-antes`, `img-despues`, `img-detalle`, `img-adicional`, todos `<input type=file accept=image/* capture=environment>`) + slots extra dinámicos hasta 10 total |
| 05 Conformidad | canvas de firma (`signature.js`), `field-firmante-nombre`, `field-firmante-documento` |
| Envío | "Descargar Acta en PDF" / Email / WhatsApp (los 3 llaman `startPdfProcess()`), envío de link de reseña Google al WhatsApp del cliente, reset |

Extras: barra GPS en header con Leaflet+OSM (`gps.js`: `getCurrentPosition` + `watchPosition` high-accuracy, guarda `window.gpsLat/gpsLng/gpsAccuracy` y string en `ge_last_gps`), barra de progreso 4 pasos (`timeline.js`), plantilla A4 oculta `#pdf-printable-template` para el PDF.

**Flujo de datos y DÓNDE SE PIERDE (la queja del cliente):**

1. **Borrador → `localStorage`** (`autosave.js`): solo TEXTO — campos, checklist states, materiales, radio. Claves: `ge_form_draft`, `ge_signature` (dataURL PNG solo tras "Confirmar Firma"), `ge_current_ot`, `ge_last_gps`.
2. **Fotos → memoria RAM del tab**: `handleImageUpload()` (`images.js`) → `compressImage()` (`utils.js`, canvas resize a 1000px, JPEG q0.7) → base64 en `window.imagesInMemory`. **Jamás tocan localStorage ni red.** Recarga de página = fotos perdidas.
3. **PDF client-side** (`pdf-generator.js`): `preparePrintableTemplate()` vuelca todo (incl. fotos, firma, minimapa capturado con html2canvas, checklist 2 columnas, materiales) al template A4 → html2canvas scale 2 → jsPDF con paginación que evita cortar fotos → blob. Ese PDF es **el único artefacto completo del acta** y vive en el celular del técnico.
4. **"Respaldo silencioso"**: solo tras generar el PDF, `saveFormDataToBackend()` hace `POST /api/forms` con un **resumen plano**: `{ot, cliente, direccion, telefono, email, tipo_servicio, tecnico, matricula, tension, corriente, diagnostico, acciones, firmante_nombre, firmante_documento, firmado(bool), num_fotos(CONTEO), gps(string), estado_final}`. Sin fotos, sin firma, sin checklist, sin materiales, sin norma, sin PDF.
5. **`web/js/api.js` (`saveActaToAPI`) es código muerto en prod**: solo corre en localhost (guard explícito anti Mixed Content), apunta a `:3001` (api-local) y referencia IDs de DOM que ya no existen (`header-ot`, `header-date`, `gps-lat`, `gps-lng`). Se dispara desde `lockSignatureAndPrompt()` en `signature.js` pero retorna sin hacer nada en producción.

**`web/admin.html` + `web/js/admin.js`** — Panel de trazabilidad: login contra `/api/auth`, token en `sessionStorage` (`ge_admin_token`), lista `GET /api/forms` con Bearer, métricas (total/hoy/semana/mes/% conforme), filtros, auto-refresh 25s, export CSV, y un "PDF resumen" regenerado con jsPDF **desde el registro resumido** — con nota explícita: *"La evidencia fotográfica y la firma quedan en el PDF original del acta que se compartió al momento del servicio"*. El propio código admite que el dato completo no está en la nube. También CRUD de usuarios del panel (crear/eliminar, cambio de contraseña).

### 1.2 `api/` — funciones serverless Vercel (5 handlers, dep única `@vercel/blob@^2.5`)

| Función | Qué hace | Storage | Auth |
|---|---|---|---|
| `auth.js` | Acciones `status/login/change-password/list-users/create-user/delete-user`. Passwords scrypt(64)+salt hex16; token = `b64url(payload{u,exp}).HMAC-SHA256` con **`BLOB_READ_WRITE_TOKEN` como secreto** (fallback hardcodeado `'clave-insegura-de-respaldo'`), TTL 12h, `timingSafeEqual` | Blob `admin_auth/<tenant>.json`, `access:'public'`, `addRandomSuffix:true` + borrado de versiones previas (workaround anti-caché CDN) | Login para todo salvo `status` |
| `forms.js` | GET lista actas (ordena por `created_at`); **POST upsert por `ot`** en un único array JSON. Preserva `created_at` original al actualizar | Blob `forms/<tenant>.json`, mismo esquema de versionado random-suffix | GET: Bearer token. **POST: NINGUNA** |
| `health.js` | Ping `{status, service:'ge-api-serverless', version:'2.0.0'}` | — | — |
| `media.js` | Proxy streaming con soporte `Range` a Supabase Storage `https://aoglarmebyimcygdrnxo.supabase.co/storage/v1/object/public/publicidad/<path>` (evita ad-blockers), cache 86400, sanitiza `..` | Supabase (hardcoded) | — |
| `reviews.js` + `reviews/[filename].js` | CRUD de revisiones de videos publicitarios (approved 1/0/2/null, comment, reviewer) | Blob `reviews/<tenant>.json`, `addRandomSuffix:false` (⚠ sin el fix anti-stale que sí tiene forms) | Ninguna |

`web/api/auth.js` y `web/api/forms.js` son **copias byte-idénticas** (diff vacío) — herencia de cuando el project root de Vercel era `web/`. `web/vercel.json` solo redirige `*.vercel.app` → dominio custom. El `vercel.json` raíz define los rewrites: `/`→`/publicidad`, `/actas`→`web/index.html`, `/admin`→`web/admin.html`, `/js|/css|/images`→`web/...`.

Multitenancy: query param `?tenant=` con default `gestiones-electricas` en todas las funciones (preparado para revender la plataforma).

### 1.3 `api-local/` — ¿port Express deployable? **Parcial, y desalineado**

Express 5 + `better-sqlite3@^11` + `uuid`, puerto 3001, CORS abierto, DB en `api-local/data/ge_platform.db` (WAL). Tablas: `reviews` (multitenant, migración automática) y `actas` con **esquema más rico que el de prod**: `id` UUID, `ot_number`, `fecha`, `tipo_visita`, `cliente`, `contacto`, `telefono`, `direccion`, `ciudad`, `tecnico`, `matricula`, `diagnostico`, `acciones`, `observaciones`, **`firma_cliente` (base64)**, `firmante_nombre/doc`, **`calificacion` 1-5**, **`estado` borrador/firmado/enviado**, `gps_lat/lng` REAL, timestamps con triggers. Rutas: `/api/health`, `/api/reviews` (CRUD+report), `/api/actas` (list con filtros, get, post con validación, PATCH status, PATCH calificación), `/api/assets` (lee **carpetas locales del Mac del dev** — `../../../../Gestiones Eléctricas/publicidad ` con espacio final).

**Veredicto**: es la API de la era LAN (se compartía con `tunnel-keep-alive.sh` → túnel SSH a localhost.run). Sirve como **esqueleto** para el VPS (el patrón DB/SQLite es aprovechable) pero NO es drop-in: le faltan `/api/forms` (el endpoint que el formulario usa hoy, con OTRO payload), `/api/auth` completo, y persistencia de checklist/materiales/fotos/tensión/corriente/norma/estado_final.

### 1.4 `mcp/` — servidor MCP stdio

`@modelcontextprotocol/sdk`, apunta a `GE_API_URL` (default `http://localhost:3001` = api-local). 9 tools: `list_videos`, `get_video_review`, `set_video_review`, `get_review_report`, `list_images`, `list_actas`, `get_acta`, `create_acta`, `get_stats`. Hoy en prod está **huérfano** (las actas reales viven en Blob vía `/api/forms`, que el MCP no conoce). En VPS se rescata gratis: `GE_API_URL=https://actas.gestioneselectricas.com` una vez el API unificado exponga `/api/actas` real.

---

## 2. Dependencias duras de Vercel y su reemplazo en VPS

| Dependencia | Dónde | Reemplazo en Coolify |
|---|---|---|
| `@vercel/blob` (`put/list/del`) + `BLOB_READ_WRITE_TOKEN` | forms, auth, reviews | **Postgres** (recomendado: la instancia del Motor RETIE ya corre en el mismo VPS 2.24.83.195 — crear DB `actas` aparte) o SQLite en volumen Docker. El truco `addRandomSuffix` anti-caché CDN desaparece: era un workaround del CDN de Vercel, no una feature |
| `BLOB_READ_WRITE_TOKEN` como secreto HMAC de sesión | auth.js/forms.js | Nueva env **`SESSION_SECRET`** (rotación limpia: los tokens duran 12h, un re-login y listo) |
| Firma de handler serverless `(req,res)` con `req.query`/`req.body` | api/*.js | Compatible casi 1:1 con Express (`express.json()` + rutas). Portar es mecánico |
| `vercel.json` rewrites | raíz | Rutas Express: `express.static('web')` + `app.get('/actas', …index.html)` + `/admin` + redirect `/`→`/publicidad`. Traefik de Coolify termina TLS; **no hace falta Nginx aparte** |
| Redirect `*.vercel.app`→dominio | web/vercel.json | Irrelevante post-migración |
| Fotos/binarios | hoy NO se suben | Volumen Docker `/data/uploads/` (suficiente para v1) o MinIO si se quiere S3-compatible; servir tras auth con `res.sendFile` |
| CDNs externos (Google Fonts, cdnjs html2canvas/jsPDF/Leaflet, tiles OSM) | index.html | Funcionan igual; opcional self-host en `/web/vendor/` para técnicos con mala señal |
| `api/media.js` → Supabase | revisor publicidad | Mantener tal cual (es fetch saliente, no depende de Vercel) o apuntar a MinIO local si se migran los videos |
| Videos `web/publicidad/*.mp4` | repo | **Excluir de la imagen Docker** (`.dockerignore`); ya existe el proxy `/api/media` |

---

## 3. Auth actual

- **Técnicos: NO se loguean.** `/actas` es pública; "Técnico Asignado" es texto libre. No hay identidad, no hay atribución confiable, y el POST de guardado es anónimo.
- **Admin (`/admin`)**: usuario+contraseña → `POST /api/auth {action:'login'}` → token HMAC 12h en `sessionStorage`. Usuarios en blob `admin_auth/gestiones-electricas.json` (scrypt+salt; nunca se exponen hashes por API). Gestión de usuarios desde el propio panel (mínimo 1 usuario, no auto-borrado). El username se extrae del payload del token en el cliente (`admin.js:getUsername`).
- Para el VPS: mantener el esquema (es sano) moviendo usuarios a tabla `users`, y **añadir login/PIN de técnico** (roadmap v2.0 del propio repo) para firmar la autoría del acta y autorizar el POST.

---

## 4. El paso de la FOTO — donde se conecta el Motor RETIE

Hoy: `<input capture=environment>` → `handleImageUpload(input, slot)` → `compressImage()` (≤1000px, JPEG q0.7, base64) → `window.imagesInMemory[slot]` + preview. Nada sale del dispositivo.

**Diseño de integración (alineado con lo que ElectroScan ya tiene construido):**

1. **Interceptar en `handleImageUpload`**: tras comprimir, `POST /api/diagnostico` **al backend de actas** (no al motor directo desde el browser) con `{ot, slot, foto_base64, gps, checklist_context}`.
2. El backend de actas guarda la foto en disco/DB (resuelve de paso la persistencia de evidencia) y reenvía al motor con service token: crear inspección (`POST /api/inspections` de ElectroScan) o adjuntar a la inspección abierta de esa OT. El motor corre su pipeline (worker pg-boss, `openrouter:google/gemini-2.5-flash`, F4 con aprendizaje en caliente ya operativo).
3. **Polling, no SSE**: el front consulta `GET /api/diagnostico/:id` (proxy de `GET /api/inspections/:id/events`) cada 3s — patrón ya validado en el motor precisamente porque SSE falla tras el proxy de Coolify.
4. **Hallazgo sugerido** → UI en el acta: card bajo el slot de foto con NC sugerida + confianza; botón "Usar en diagnóstico" concatena al `field-diagnostico` y marca el ítem del checklist correspondiente en "Falla"; el mapeo checklist(8 ítems)↔categorías de hallazgo es natural (tablero, SPT, conductores…).
5. **Confirmación del técnico** → `PATCH /api/findings/{id}/review` del motor (endpoint real, ya cableado a las cards de diseño `detalle-hallazgo-movil.html`), lo que además alimenta el gate `auto_accepted` (50 etiquetas, ≥90% precisión) del aprendizaje del motor.
6. **Persistir el vínculo**: `acta.inspection_id` + `acta_fotos.finding_ids[]` — esto es lo que después arma la hoja de vida del activo cruzando actas ↔ inspecciones.
7. **Costos**: respetar tope de 10 fotos/acta (ya existe en la UI); una corrida cuesta ~$0.05–0.21 según la bitácora del motor → analizar bajo demanda (botón "Diagnosticar con IA" por foto), no automático en cada upload.

---

## 5. Estrategia de deploy VPS recomendada (concreta)

**Un solo servicio nuevo `ge-actas` en el Coolify del VPS 2.24.83.195** (mismo proyecto que ElectroScan), + la DB compartida:

```
apps/actas/
├── Dockerfile
├── server.js            # Express: estático + API unificada
├── src/routes/{auth,forms,fotos,diagnostico,reviews,media,actas}.js
├── src/db/              # pg (o better-sqlite3 v1)
└── web/                 # el web/ actual tal cual (sin publicidad/*.mp4)
```

**Dockerfile** (single-stage basta, no hay build de front):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js src ./
COPY web ./web
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node","server.js"]
```
(Si se elige SQLite: `apk add python3 make g++` para compilar better-sqlite3, y volumen en `/data`.)

**Coolify Application**: Dockerfile build, dominio `actas.gestioneselectricas.com`, health `/api/health`, volumen `actas-data:/data` (uploads + sqlite si aplica), rolling deploy ON.

**Envs**:
- `SESSION_SECRET` (nuevo, obligatorio — reemplaza al token de Blob como clave HMAC)
- `DATABASE_URL=postgres://…@<postgres-coolify>:5432/actas` (o `SQLITE_PATH=/data/ge.db`)
- `UPLOADS_DIR=/data/uploads`
- `MOTOR_URL=https://electroscan.gestioneselectricas.com` + `MOTOR_SERVICE_TOKEN`
- `DEFAULT_TENANT=gestiones-electricas`

**DNS**: patrón ya documentado y probado para este cliente — record A `actas → 2.24.83.195` vía cPanel API de gestioneselectricas.com (igual que se hizo con `electroscan`). Hoy `actas` apunta a Vercel; el cutover es cambiar ese record; Let's Encrypt lo emite Traefik/Coolify automático.

**Plan de migración (orden importa):**
1. Portar las 5 funciones a rutas Express (mecánico) + tablas `users`, `actas` (esquema extendido, ver §6), `acta_fotos`, `reviews`.
2. **Script one-shot de export ANTES del cutover**: con el `BLOB_READ_WRITE_TOKEN` vigente, `list()` + fetch de `forms/gestiones-electricas*`, `admin_auth/*`, `reviews/*` → seed de la DB. (Los blobs son la única copia de las actas históricas.)
3. Deploy en Coolify, smoke test contra IP/dominio temporal, login admin, POST de acta de prueba.
4. Cambiar DNS `actas` → VPS. Dejar el proyecto Vercel una semana como respaldo y luego archivarlo; revocar el token de Blob al final.
5. Repuntar `mcp/` con `GE_API_URL=https://actas.gestioneselectricas.com` y añadir al API los endpoints `/api/actas` que el MCP espera.
6. Fase 2 (motor): endpoints `/api/diagnostico` + service token, UI de hallazgo sugerido en el formulario.

**Arreglos que deben entrar CON la migración** (si no, se replica la queja): POST de actas autenticado (login/PIN de técnico), OT secuencial generado por el servidor (`OT-{seq}` por tenant), guardado incremental server-side (autosave → API, no solo localStorage), y subida real de fotos+firma en el momento de la captura (no solo dentro del PDF).

---

## 6. JSON del acta hoy vs. lo que falta para la "hoja de vida del activo"

**Persiste hoy** (un objeto por OT en `forms/gestiones-electricas.json`):
```json
{"ot":"OT-1035","cliente":"…","direccion":"…","telefono":"…","email":"…",
 "tipo_servicio":"Diagnóstico","tecnico":"…","matricula":"…",
 "tension":"120/208","corriente":"15","diagnostico":"…","acciones":"…",
 "firmante_nombre":"…","firmante_documento":"…","firmado":true,
 "num_fotos":4,"gps":"10.99, -74.87","estado_final":"si",
 "created_at":"…","updated_at":"…"}
```

**Falta persistir** (gap para hoja de vida del activo):

| Dato | Estado hoy | Necesario |
|---|---|---|
| Fotos (antes/después/detalle/extras) | solo conteo `num_fotos` | archivos + metadata `{slot, url, tomada_at, gps, inspection_id?}` en tabla `acta_fotos` |
| Firma del cliente | solo bool `firmado` | PNG base64/archivo + timestamp + gps de firma (api-local ya tenía la columna) |
| Checklist 8 ítems | ausente | `{item_id, estado ok/fail/neutral}[]` — es el dato RETIE estructurado más valioso del acta |
| Materiales | ausente | `{desc, cant, ref}[]` (además habilita cotizaciones, idea del roadmap) |
| Norma aplicable | ausente | campo `norma` |
| PDF final | solo en el celular del técnico | archivar el blob PDF en el server (o regenerarlo server-side) |
| **ID del activo/sede** | no existe — solo dirección texto libre | tablas `clientes` y `activos` (sede/tablero/subestación) con `acta.activo_id` → **sin esto no hay hoja de vida**, solo lista de actas |
| OT | aleatorio cliente, colisionable | secuencia server-side |
| Historial | upsert pisa el registro | versionado/append + auditoría (quién, cuándo) |
| GPS | string display | `lat/lng/accuracy` numéricos (api-local ya los tenía) |
| Calificación cliente | en schema api-local, nunca cableada | rescatar (PATCH calificación existe en api-local) |
| Vínculo motor RETIE | no existe | `inspection_id`, `finding_ids[]`, estado de confirmación de cada hallazgo |
| Ciclo de vida | solo `estado_final` (condición operativa) | estado del documento: borrador→firmada→enviada→cerrada (cierre de hallazgos ya está en el backlog del motor, ítem 6) |
| Autoría | texto libre | `created_by` = usuario técnico autenticado |

Con `activos` + `actas` + `acta_fotos` + `findings` (del motor) en el mismo Postgres, la "hoja de vida del activo" es una consulta: todas las visitas, mediciones (tensión/corriente en el tiempo), evidencias, hallazgos NC y sus cierres por activo — y el QR del acta hacia el historial (idea que ya estaba en el ROADMAP.md del repo) sale gratis.
