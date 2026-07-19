# es360-motor

## Resumen
ElectroScan 360 ya tiene todas las piezas del "motor RETIE" construidas pero acopladas al flujo asíncrono de inspección (pg-boss + worker): expertos MoE puros con modelo por parámetro, retrieval híbrido RRF sobre corpus_chunks, validador determinista de citas, kill-switch de costos y loop de aprendizaje goldenLabel/reviewMotivo. Exponer un POST /api/diagnostico síncrono para el ACTA es viable con bajo esfuerzo: los expertos son funciones puras reusables desde cualquier proceso Node; lo que falta es (a) una ruta con auth por API key (hoy solo hay sesión better-auth), (b) un subset del pipeline sin fan-out (clasificador → observador → hipótesis → RAG → evaluador con citas, ~5-8 llamadas LLM, <30s con Flash), (c) una tabla `assets` con ID único como eje de hoja de vida, y (d) persistir el diagnóstico en `findings` (con inspección "contenedor" tipo acta) para que la confirmación del técnico alimente el mismo golden set sin tocar nada del aprendizaje ya construido.

## Hallazgos clave
- Los 10 expertos en packages/ai/src/experts.ts son funciones puras (modelo por parámetro, sin dependencia del worker ni de pg-boss) — el motor ya es 'API-able'; el acoplamiento está solo en apps/worker/src/pipeline.ts (markers cached(), budget, eventos).
- Ya existe un precedente de flujo síncrono LLM+RAG+citas dentro de Next: POST /api/inspections/[id]/chat (copiloto) corre ragSearch + generateJson + validateCitations inline con maxDuration=60 — el /api/diagnostico puede seguir exactamente ese patrón de ruta.
- La auth actual es 100% sesión de navegador (better-auth via apps/web/lib/api-auth.ts requireSession). NO existe ningún mecanismo de API key machine-to-machine: hay que crear tabla api_keys (hash SHA-256, scoped a organization) para que el sistema de ACTAS llame al motor.
- El aprendizaje ya cierra el loop genéricamente sobre findings: PATCH /api/findings/[id]/review escribe goldenLabel/reviewMotivo y getLearningPromptBlock() inyecta las últimas 10 correcciones como guía negativa en CADA llamada al evaluador — si el diagnóstico del acta se persiste como finding, la corrección del técnico en el acta alimenta el motor sin escribir código nuevo de aprendizaje.
- No existe modelo de 'activo' con identidad propia: inspection_images.clasificacion y el consolidado F2 (JSON efímero en pipeline_phase_runs) son lo más cercano; sites es el único agregado físico. Falta tabla assets (org+site+código único) con FK opcional asset_id en findings e inspections para armar la hoja de vida sin romper el flujo actual.
- El kill-switch de costos (RUN_CAP_USD por inspección + daily_cost_ledger global) vive en el worker (assertBudget en pipeline.ts), no en el paquete ai — un endpoint síncrono que llame generateJson directo BYPASEA hoy el presupuesto diario: hay que extraer assertBudget/ledger a @electroscan/core para compartirlo.
- Latencia estimada del subset inline con gemini-2.5-flash-lite (visión) + flash (razonamiento): clasificador ~2-3s + observador ~3-4s + hipótesis ~3-5s + embedding+RAG ~1s + evaluador (1-3 hipótesis top) ~4-8s c/u ⇒ 15-25s típico, dentro del presupuesto <30s, PERO el retry de 429 de Vertex espera 20-90s (backoffMs en llm.ts) y rompería el budget — el endpoint síncrono necesita su propio perfil de retry corto o fail-fast.
- El validador de citas (packages/ai/src/citations.ts) es determinista y sin estado — se reusa tal cual en el diagnóstico inline; findingCitations exige chunk_id con ON DELETE RESTRICT, garantizando que el artículo citado en el acta siga existiendo en el corpus.

## Riesgos
- Costos sin gobernador: el flujo inline hoy no pasa por assertBudget (vive en el worker). Cada foto de acta ≈ $0.01-0.05 con Flash vía OpenRouter; 20 técnicos × 30 fotos/día puede multiplicar el gasto actual ×10 sin que el daily_cost_ledger lo vea. Mitigar: mover assertBudget+ledger a core y darle al endpoint su propio cap (ej. DIAGNOSTICO_DAILY_CAP_USD) + costo por api_key.
- Retry/timeout incompatibles con síncrono: LLM_MAX_ATTEMPTS=6 con backoff de hasta 90s en 429 está pensado para el worker; en el acta el técnico está esperando con la foto en la mano. Un 429 de Vertex/OpenRouter en campo = timeout del cliente + costo pagado sin respuesta entregada. Mitigar: maxAttempts=2, backoff corto, AbortSignal con budget de 25s, y respuesta 202 con retry-after como fallback.
- Doble escritura y doble marca: si el acta llama /diagnostico por foto Y luego la inspección completa se procesa por el pipeline batch, el mismo defecto puede salir dos veces (finding inline + finding del fan-out) contaminando dashboard, NC trend y el golden set. Mitigar: inspecciones tipo 'acta' con flag que el dispatcher de pg-boss excluye, o markers compartidos (mismo pipeline_phase_runs por targetKey=imageId).
- Rate limit del proveedor compartido: el endpoint síncrono y el worker comparten la misma quota por minuto de Vertex/OpenRouter; un batch nocturno puede degradar los diagnósticos en vivo de los técnicos (y viceversa). Mitigar: model_config con key propia (diagnostico_vision/diagnostico_razonamiento) para poder apuntar a proveedor/quota distinta sin deploy.
- Acoplamiento de contrato: si el ACTA consume el JSON del hallazgo directamente, cambios en evaluacionZ (estados NC/C/D/S, formato citas) rompen al cliente externo. Mitigar: versionar la respuesta (v: 1) y congelar el shape del output del endpoint separado del shape interno de los expertos.
- Calidad con contexto reducido: el diagnóstico por foto pierde el consolidador F2 multi-imagen y la HDV completa; una foto aislada de un tablero puede generar falsos positivos que el pipeline completo habría descartado. Mitigar: exigir el contexto mínimo (tipoInstalacion, nivelTension) en el request, umbral de confianza ≥60 igual que F4, y marcar todo diagnóstico inline como needs_review hasta que el técnico confirme en el acta.
- Payload y ancho de banda en campo: fotos de 15MB en base64 (+33%) contra un endpoint síncrono en el VPS Coolify de 1 core puede saturar memoria/tiempo antes del LLM. Mitigar: multipart (no base64), límite 8MB, y downscale con sharp antes de mandarla al modelo.

## Detalle
MAPA DE SUPERFICIE — ElectroScan 360 (D:\TRABAJOS PROPIOS\projects\electroscan360)

== (1) INVENTARIO ==

TABLAS (packages/core/src/schema.ts — 17):
- organizations (raíz multi-tenant; v1 single-tenant vía getOrCreateDefaultOrg slug 'gestiones-electricas')
- user / session / account / verification (better-auth, contrato del adapter)
- sites (org + name + city — único agregado "físico" hoy)
- inspections (status draft→submitted→processing→…→completed; tipoInstalacion, nivelTension, proceso, hdv JSON snapshot, resumen F5, contactEmail, reportSentAt)
- inspection_images (storageKey inmutable insp/{id}/orig-{sha256}, exif probatorio, clasificacion/qualityScore/ocrExtract llenados por F1)
- hdv_measurements (tipo/valor/expiresAt → alertas v_alerts)
- model_config (key→modelId; modelos JAMÁS hardcodeados, swap por UPDATE)
- pipeline_runs (1 por corrida; totalCostUsd, status incl. failed_budget)
- pipeline_phase_runs (marker de idempotencia POR INSPECCIÓN: unique(inspectionId, phase, expertKey, targetKey); guarda output JSON + costo + tokens — replay tras crash reusa lo pagado)
- inspection_events (feed del polling UI)
- findings (titulo, estado NC|C|D|S, severidad, confianza, gate high_confidence|needs_review|auto_accepted, evidenceImageId, goldenLabel correcto|incorrecto, reviewMotivo, reviewedBy/At)
- finding_citations (chunkId ON DELETE RESTRICT, quote, validated, validationNote)
- daily_cost_ledger (kill-switch capa 2, presupuesto diario global)
- chat_messages + chat_message_citations (copiloto RAG, refused flag)
- report_access_tokens (token opaco /r/{token}, 30 días, revocable, downloadCount)
- corpus_documents (code/edition únicos, vigencia) + corpus_chunks (jerarquía refPath 'RETIE-2026:L3.A10.3.1', halfvec 1536 HNSW + tsvector español + trigram — triple índice para RRF)

ENDPOINTS (apps/web/app/api — 10 rutas, TODAS con requireSession de better-auth excepto health):
- GET /api/health — ping DB
- /api/auth/[...all] — better-auth
- POST /api/inspections — multipart (payload Zod createInspectionSchema + fotos 1-10, ≤15MB, jpeg/png/webp); dedup por sha256; crea site+inspection status=submitted (el dispatcher pg-boss la recoge cada minuto)
- GET /api/inspections — lista 50
- GET /api/inspections/[id] — detalle
- GET /api/inspections/[id]/events — polling de status+eventos+findings+citas
- POST /api/inspections/[id]/report — token compartible
- POST /api/inspections/[id]/chat — ★ PRECEDENTE SÍNCRONO: ragSearch(k=6) + copilotAnswer + validateCitations inline, maxDuration=60
- POST /api/inspections/[id]/send-email — envío informe
- GET /api/images/[id] — sirve la imagen
- PATCH /api/findings/[id]/review — goldenLabel + reviewMotivo (el "sí/no/porqué" del técnico)

PIPELINE (apps/worker/src/pipeline.ts — MoE F1-F5):
F1 visión por imagen con fan-out p-limit(6): clasificadorEntrada → si es_electrica: [evaluadorCalidad, observadorActivos, extractorOcr degradable] en paralelo. F2 consolidadorActivos (razonamiento, JSON de todos los análisis). F3 generadorHipotesis (máx 8, con HDV). F4 por hipótesis (cap 10): planificadorConsultas → ragSearch(k=8) → evaluadorCumplimiento (con bloque de aprendizaje) → validateCitations → insert findings+citations; rechaza si !aplica o confianza<60; gate = needs_review salvo confianza≥90 (auto_accepted bloqueado hasta ≥50 etiquetas y precisión≥90%). F5 estructuradorInforme → inspections.resumen. Infra: cached() = marker idempotente + assertBudget (RUN_CAP_USD=1.0/inspección + DAILY_CAP_USD=20 global) ANTES de cada llamada; BudgetError → status failed_budget; re-proceso borra findings y reusa phase_runs pagados.

PACKAGES/AI: experts.ts (10 expertos = funciones puras: model string + input → generateJson con responseSchema Vertex + Zod); llm.ts (dual provider: Vertex GenAI SDK o prefijo 'openrouter:' → API OpenAI-compatible con json_schema; retry hasta 6 intentos, backoff 429 de 20-90s, duplicación de maxOutputTokens en truncado; costo exacto de usage.cost de OpenRouter o tabla PRICES); retriever.ts (ragSearch → función SQL rag_search: RRF vector+FTS+trigram, filtro vigencia); citations.ts (validador determinista: índice en rango + quote literal o fuzzy ≥85% tokens); copilot.ts (respuesta anclada con refused); embeddings.ts (Vertex, 1536 dims).

APRENDIZAJE (packages/core/src/dashboard.ts): GOLDEN_META=50; getReviewStats() cuenta goldenLabel correcto/incorrecto + precisión; getLearningPromptBlock() toma las últimas 10 correcciones 'incorrecto' con motivo y las inyecta como guía negativa en el prompt del evaluador EN CADA corrida — aprendizaje en caliente sin reentrenar.

== (2) DISEÑO: POST /api/diagnostico (motor síncrono para el ACTA) ==

Principio "un motor, varias puertas": el motor = expertos + ragSearch + validateCitations (ya son librería). La puerta nueva = una ruta Next en apps/web/app/api/diagnostico/route.ts (mismo proceso que el chat, que ya prueba el patrón síncrono) + un módulo compartido packages/ai/src/diagnose.ts para que web y worker usen EXACTAMENTE la misma secuencia.

INPUT (multipart preferido; base64 aceptado como fallback JSON):
  POST /api/diagnostico
  Headers: Authorization: Bearer es360_<key>   (API key, ver abajo)
  Fields:
    foto: File (jpeg/png/webp, ≤8MB — reusar ALLOWED_IMAGE_TYPES; downscale sharp a ~1568px antes del modelo)
    contexto: JSON Zod:
      { tipoInstalacion: enum hdvSchema, nivelTension: 'BT'|'MT'|'AT',
        ubicacion?: string,            // "Tablero principal piso 2" — va al prompt de hipótesis
        assetId?: uuid,                // si el acta ya conoce el activo (ver §3)
        actaRef?: string,              // id externo del acta, para trazabilidad
        maxHallazgos?: 1..3 (default 2) }

SUBSET DEL PIPELINE (inline, sin fan-out, sin F2 consolidador ni F5):
  1. clasificadorEntrada(vision, foto) — si !es_electrica → respuesta corta sin más gasto (~2s, 1 llamada).
  2. observadorActivos(vision, foto) — activos + riesgos visibles (~3s). (Omitir calidad y OCR: enriquecimiento, no crítico para el hallazgo; opcionalmente OCR con .catch degradable si contexto.tipoInstalacion='subestacion'.)
  3. generadorHipotesis(razonamiento, JSON({activos, riesgos, ubicacion}), JSON(contexto)) — pedir máx 3 en el prompt (variante o parámetro).
  4. Por cada hipótesis top-N (N=maxHallazgos, secuencial): planificadorConsultas (o heurística barata: usar titulo+descripcion como query directa y ahorrarse 1 llamada) → ragSearch(query, {k:8}) → evaluadorCumplimiento(razonamiento, h, chunks, n, aprendizaje) → validateCitations.
  5. Filtros idénticos a F4: descartar !aplica o confianza<60; citas no validadas → nota "[SIN CITA VALIDADA]".
  Presupuesto: 5-8 llamadas LLM ≈ 15-25s con flash-lite/flash. Guardas: AbortSignal 25s total; LLM retry perfil corto (maxAttempts 2, sin espera de 90s — parámetro nuevo en generateJson); cap de costo por diagnóstico (~$0.10) verificado contra daily_cost_ledger ANTES de empezar (extraer assertBudget del worker a @electroscan/core).

OUTPUT JSON:
  { v: 1,
    diagnosticoId: uuid,               // fila persistida (finding)
    esElectrica: true,
    activoDetectado: { tipo, descripcion, condicion },
    hallazgos: [ {
      titulo, descripcion,
      estado: 'NC'|'C'|'D'|'S',
      severidad: 'alta'|'media'|'baja',
      confianza: 87,
      articulo: 'RETIE-2026:L3.A10.3.1',     // refPath del chunk principal
      citas: [ { refPath, quote, pagina, validated: true } ],
      gate: 'needs_review'                    // SIEMPRE needs_review en inline hasta confirmación
    } ],
    costUsd: 0.021, latencyMs: 18400 }
  Errores: 401 key inválida, 402/429 presupuesto o rate limit (con retryAfterSec), 408 si no cerró en 25s (devolver lo parcial si al menos el clasificador terminó), 422 foto inválida.

PERSISTENCIA: cada llamada crea/usa una inspection "contenedor" (proceso='acta', status='completed', creada por la key) o cuelga de la inspección del acta si el ACTA vive en la misma DB; guarda la foto en inspection_images (mismo storageKey sha256), los hallazgos en findings (evidenceImageId = la foto) y las citas en finding_citations. Esto reusa TODO el andamiaje (dashboard, NC trend, review, aprendizaje) sin tablas paralelas.

AUTH POR API KEY (nuevo, mínimo):
  tabla api_keys { id uuid, organizationId FK, name, keyHash text (sha256 de 'es360_'+randomBytes(24)b64url — mismo patrón que report_access_tokens), scopes text[] default ['diagnostico'], lastUsedAt, revokedAt, createdAt }.
  apps/web/lib/api-auth.ts gana requireApiKey(req): lee Bearer, hashea, busca no-revocada, devuelve {organizationId, keyId}. La ruta acepta sesión O api key (el panel podrá probarla). Rate limit simple por key: contador en memoria/Redis o ventana sobre pipeline_phase_runs (targetKey=keyId) — 10 req/min por key para empezar.

== (3) MODELO "ACTIVO" QUE FALTA ==

Hoy la identidad del activo es efímera (clasificacion por imagen + consolidado F2 en JSON). Propuesta aditiva, cero cambios destructivos:
  assets { id uuid PK, organizationId FK, siteId FK, codigo text UNIQUE por org (QR/placa, ej. 'GE-TAB-0042'), tipo (tablero|transformador|puesta_a_tierra|acometida|luminaria|otro — mismo vocabulario del clasificador), descripcion, ubicacion, createdAt }
  + columna NULLABLE asset_id en: inspections (acta/inspección dirigida a un activo), inspection_images (la foto pertenece al activo), findings (el hallazgo afecta al activo), hdv_measurements (medición del activo).
Por ser NULLABLE, el pipeline batch actual sigue funcionando sin tocar una línea; el flujo de acta pasa assetId y de inmediato existe la HOJA DE VIDA: SELECT de findings+citations+measurements+images+inspections WHERE asset_id=X ordenado por fecha = historial completo (actas + diagnósticos + mediciones + evolución NC). getSiteScores() puede ganar después un nivel activo→sede. Creación lazy: si el acta manda codigo desconocido, upsert (mismo patrón que sites en POST /api/inspections).

== (4) CONFIRMACIÓN DEL TÉCNICO EN EL ACTA → APRENDIZAJE ==

No hay que construir nada nuevo de aprendizaje: como el diagnóstico inline SE PERSISTE como finding, el acta simplemente llama el endpoint existente PATCH /api/findings/[id]/review (o una variante con API key) con {veredicto:'correcto'|'incorrecto', motivo}. Flujo en el acta: el técnico ve el hallazgo sugerido en el paso de la foto → botones Confirmar / Corregir (con motivo obligatorio al corregir) → PATCH. Efectos automáticos ya cableados: (a) goldenLabel suma al golden set (GOLDEN_META=50 desbloquea auto_accepted con precisión≥90% — las confirmaciones de campo aceleran la meta mucho más rápido que la revisión de gabinete); (b) reviewMotivo entra a getLearningPromptBlock() y desde la SIGUIENTE llamada al evaluador (tanto en /diagnostico como en el pipeline batch) actúa como guía negativa — el motor aprende de las correcciones del acta en caliente. Único ajuste necesario: permitir requireApiKey en la ruta de review y setear reviewedBy de forma que tolere identidad no-user (ej. columna reviewedByKey o user técnico sombra), porque reviewedBy referencia user.id. Mejora opcional: cuando la corrección incluye el artículo correcto ('era el A20.3, no el A10.3'), guardarlo estructurado para futura evaluación del retriever.

== (5) RIESGOS DE ACOPLAR (resumen operativo) ==

(a) Costos: extraer assertBudget/daily_cost_ledger a core ANTES de abrir la puerta; cap por llamada + cap diario propio del endpoint + costo agregado por api_key (targetKey en phase_runs o columna key_id). (b) Rate limits compartidos: worker batch y diagnósticos en vivo compiten por la misma quota LLM — keys de model_config separadas (diagnostico_*) permiten mover el inline a otro proveedor sin deploy; rate limit por API key en la puerta. (c) Timeouts: perfil de retry corto exclusivo del síncrono (el backoff 429 actual de 20-90s es veneno para un request con técnico esperando); 25s de presupuesto duro y 202/parcial como degradación. (d) Doble procesamiento: si una inspección de acta también entra al dispatcher, hallazgos duplicados — excluir proceso='acta' del barrido dispatch-submitted, o compartir markers por imageId. (e) Contrato: versionar el JSON de respuesta (v:1) e independizarlo de evaluacionZ interna. (f) Calidad monofoto: sin consolidador multi-imagen ni HDV completa, más falsos positivos — por eso gate=needs_review forzoso en inline + confirmación del técnico como control (que además alimenta el golden set: el riesgo financia el aprendizaje).

Archivos clave: D:\TRABAJOS PROPIOS\projects\electroscan360\packages\core\src\schema.ts · packages\core\src\dashboard.ts (aprendizaje) · packages\core\src\inspection.ts (Zod + org default + patrón token opaco) · packages\ai\src\{experts,llm,retriever,citations,copilot}.ts · apps\worker\src\{pipeline,index}.ts · apps\web\lib\api-auth.ts · apps\web\app\api\inspections\route.ts · apps\web\app\api\inspections\[id]\chat\route.ts (precedente síncrono) · apps\web\app\api\findings\[id]\review\route.ts (puerta del aprendizaje).
