# proto-portal

## Resumen
El prototipo es un dashboard single-page "Portal del Cliente" para el administrador de un edificio (Torres del Parque): hero con gauge de % "en norma", 4 stat cards (total/conformes/pendientes/en riesgo), alarmas R/A con riesgos cuantificados en COP y CTA "Solicitar normalización", agenda de próximas revisiones, CTA de certificación RETIE, tabla "Mis activos · hoja de vida" con semáforo por activo, y un drawer "Hoja de vida del activo" con facts técnicos + timeline de intervenciones con norma citada y link a acta PDF. ElectroScan 360 ya cubre inspections/findings/citations/informe público /r/{token}, pero NO tiene la entidad central del prototipo: el "activo" persistente con historial cross-inspección, ni semáforo agregado, ni agenda, ni solicitudes de normalización, ni identidad/acceso del cliente final.

## Hallazgos clave
- La entidad central del prototipo es el ACTIVO (TB-01, AC-01, TR-01, SPT-01) con hoja de vida cross-inspección; en el schema actual (packages/core/src/schema.ts) NO existe tabla assets — findings y hdv_measurements cuelgan de inspections, no de un activo persistente.
- Ya existe y se reutiliza directo: sites (~edificio/sede), inspections (status, hdv, resumen, contactEmail), findings (estado NC|C|D|S, severidad, gate, evidencia) ~ alarmas, finding_citations (quote de corpus RETIE) ~ chip de norma, hdv_measurements.expiresAt ~ base de 'próximas revisiones', y el patrón token opaco /r/{token} + /r/{token}/pdf ~ 'Ver acta digital (PDF)'.
- Falta construir: tabla assets + asset_id en findings/mediciones, semáforo por activo (derivado del último finding) y agregado por sede (gauge %), entidad scheduled_visits (agenda), service_requests ('Solicitar normalización' / 'Solicitar certificación' hoy son solo un toast), notificaciones, y riesgos tipados con montos COP.
- Acceso recomendado: replicar el patrón ya existente de token opaco pero scoped a sede/cliente (portal_access_tokens con siteId, expirable/revocable, enviado por magic-link a inspections.contactEmail) en ruta /p/{token}; login better-auth con rol 'client' solo como fase 2 si las acciones lo exigen.
- Bugs/incoherencias del prototipo: gauge dice 72% pero 8/12 conformes = 66.7%; la fila 'Tablero piso 3 (TB-03)' abre el panel de tr01 (transformador); solo lista 5 de los 12 activos declarados; cita 'RETIE 2022' cuando el corpus ingerido es RETIE 2026.
- Los estados del portal (Conforme/Pendiente/No cumple) no mapean 1:1 con findings.estado (NC|C|D|S) — hay que definir el mapping (¿D y S caen en 'Pendiente'?).

## Riesgos
- Montos económicos mostrados al cliente ('Multa RETIE estimada: $8–20 millones COP', 'Sobrecosto ~$450.000 COP/mes'): si los genera el LLM hay riesgo legal/comercial de cifras alucinadas; deben venir de tabla paramétrica curada por GE o quedar fuera del MVP.
- Exponer hallazgos NC con severidad al cliente final antes del gate needs_review del ingeniero rompería el release gate actual (spec §7: todo entra como needs_review); el portal solo debe mostrar findings revisados/aprobados.
- Un token de portal de larga vida con datos de riesgo eléctrico del edificio es más sensible que el token de un solo informe: necesita expiración+rotación+auditoría, y las acciones (solicitar normalización) requieren atribución de identidad.
- El prototipo asume inventario de activos ya cargado y mantenido; sin definir quién lo crea (GE manual vs derivado de la IA de inspección) el portal no tiene datos que mostrar.
- Deriva de marca/estado: el prototipo usa paleta lime/forest propia de GE y 3 estados de semáforo; si no se canoniza el mapping con NC|C|D|S y el design-system existente, panel interno y portal contarán historias distintas sobre el mismo hallazgo.

## Detalle
# Análisis del prototipo Portal del Cliente GE

Archivo: `D:/TRABAJOS PROPIOS/projects/electroscan360/prototipo-portal-cliente-GE_1.html` (547 líneas, single-page, vanilla HTML/CSS/JS, es-CO).
Código real contrastado: `D:/TRABAJOS PROPIOS/projects/electroscan360/packages/core/src/schema.ts` y rutas en `D:/TRABAJOS PROPIOS/projects/electroscan360/apps/web/app/`.

## 1. Inventario de pantallas / secciones / componentes

### Identidad visual
- Tipografía: `--font: 'Gill Sans', 'Gill Sans MT', 'Hanken Grotesk', system-ui` (carga Hanken Grotesk 400–800 de Google Fonts).
- Paleta marca: `--lime #C9E400`, `--lime-dim #B5CD00`, `--olive #8EA100`, `--olive-dark #5E6B00`, `--forest #2B3000` (verde muy oscuro, superficie hero), `--bg #FAFBF4`, superficies `#FFFFFF / #F2F4E6 / #E8EBD6`.
- Semáforo (R/A/V): verde `#3B6D11` sobre `#EAF3DE`; ámbar `#A96A0B` sobre `#FBEFD8`; rojo `#A32D2D` sobre `#FBEAEA`.
- Radios 16px/10px, sombras suaves, hero y cards oscuras en forest con acentos lime.

### a) Header (sticky, 62px, fondo blanco)
- Logo SVG: círculo forest con dos "hojas" lime/olive y un rayo; texto "Gestiones eléctricas" (l1) / "Portal del cliente" (l2, olive).
- Derecha: botón campana con dot rojo (notificaciones, sin funcionalidad) + chip de cuenta: avatar circular "TP" (forest/lime) + "Edificio Torres del Parque" / rol "Administración".

### b) Hero de estado (card forest, radius 20)
- Izquierda: "Bienvenido de nuevo," / nombre cliente "Edificio Torres del Parque" (22px/700) / sub "12 activos eléctricos monitoreados · Última inspección: 15 jul 2026".
- Derecha: gauge SVG circular 92px (stroke lime, dasharray 251/offset 70) con "**72%** / en norma" + leyenda: dot `#8FE1A0` "8 conformes", dot `#F5C46B` "2 pendientes", dot `#E88` "2 en riesgo".

### c) Stat cards (grid 4, colapsa a 2 en <860px)
| Card | Número | Nota |
|---|---|---|
| Activos totales (icono grid, olive) | 12 | "Transformadores, tableros, SPT" |
| Conformes (check verde) | 8 (verde) | "Operando 100% bajo norma" |
| Pendientes (triángulo ámbar) | 2 (ámbar) | "Requieren adecuación" |
| En riesgo (triángulo rojo) | 2 (rojo) | "Acción inmediata" |

### d) Columna izquierda (1.5fr): "Alarmas activas" + badge rojo "2 críticas"
Tres cards `.alarm` (fondo rojo/ámbar claro, borde tintado, icono en cuadro sólido, tag uppercase a la derecha):
1. **ROJA** — "Sistema de puesta a tierra sin barraje" · subtítulo activo "Tablero general · TB-01 · Sótano" · tag "NO CUMPLE". Riesgos (filas con icono): "Riesgo de electrocución y descarga a usuarios"; "Expuesto a sanción en inspección RETIE"; fila money (bold): "Multa RETIE estimada: $8–20 millones COP". Acciones: botón primario forest "Solicitar normalización" (→ toast) + botón outline "Ver detalle" (→ abre panel `tb01`).
2. **ROJA** — "Sobrecarga en acometida principal" · "Acometida · AC-01 · Cuarto eléctrico" · "NO CUMPLE". Riesgos: "Riesgo de incendio por sobrecalentamiento"; money: "Sobrecosto energético: ~$450.000 COP/mes". Mismos 2 botones (panel `ac01`).
3. **ÁMBAR** — "Señalización de seguridad incompleta" · "Cuarto eléctrico · General" · tag "PENDIENTE". Riesgo único: "Observación menor RETILAP · plazo recomendado 30 días". Solo botón "Solicitar normalización" (sin detalle — no es un activo).

### e) Columna derecha (1fr): "Próximas revisiones"
- Side-card "Agenda de mantenimiento" (icono calendario): 3 filas con bloque-fecha (día grande + mes uppercase) + título + subtipo:
  - **02 Ago** · Transformador TR-01 · "Mantenimiento preventivo"
  - **18 Ago** · Tableros piso 3–5 · "Inspección termográfica"
  - **05 Sep** · SPT general · "Medición de resistencia"
- Card oscura (forest) "Certificación RETIE" (icono doc lime): copy "Al normalizar los 2 activos en riesgo, tu edificio queda listo para el certificado de conformidad RETIE." + botón lime full-width "Solicitar certificación" (→ mismo toast).

### f) "Mis activos · hoja de vida" (tabla card)
Columnas: Activo (icono 38px + nombre + código mono) · Ubicación · Estado (pill con dot) · Última acta · chevron. Filas clickeables (hover surface-2) que abren el drawer:
| Activo | Código | Ubicación | Estado | Última acta |
|---|---|---|---|---|
| Tablero general | TB-01 | Sótano | No cumple (rojo) | 15 jul 2026 |
| Acometida principal | AC-01 | Cuarto eléctrico | No cumple (rojo) | 15 jul 2026 |
| Transformador | TR-01 | Subestación | Conforme (verde) | 10 jul 2026 |
| Puesta a tierra (SPT) | SPT-01 | General | Pendiente (ámbar) | 10 jul 2026 |
| Tablero piso 3 | TB-03 | Piso 3 | Conforme (verde) | 08 jul 2026 |

En móvil (<860px) se ocultan Ubicación y Última acta. **Nota:** solo hay 5 filas para "12 activos" y la fila TB-03 llama `openPanel('tr01')` (bug del prototipo: no existe data `tb03`).

### g) Drawer "Hoja de vida del activo" (panel derecho 480px + overlay)
- Head sticky: "Hoja de vida del activo" + botón cerrar.
- Hero del activo: icono 52px + nombre + "{id} · {ubicación} · Edificio Torres del Parque".
- **Facts** (grid 2×2, label uppercase + valor bold), varían por tipo de activo:
  - TB-01: Estado actual "No cumple" · Tensión "208 V" · Corriente "62 A" · Resistencia SPT "—"
  - AC-01: Estado "No cumple" · Tensión "214 V" · Corriente "188 A" · **Capacidad "160 A"**
  - TR-01: Estado "Conforme" · **Potencia "75 kVA"** · Tensión "13.2 kV" · Última medición "OK"
  - SPT-01: Estado "Pendiente" · **Resistencia "12 Ω"** · **Máximo norma "≤ 25 Ω"** · Observación "Menor"
- **"Historial de intervenciones"** (timeline vertical con dots de estado verde-check / rojo-X / ámbar-warn y línea conectora). Cada entrada: tipo de acto + fecha + descripción + chip de norma + link "Ver acta digital (PDF)". Ejemplos:
  - TB-01: "Diagnóstico correctivo" 15 jul 2026 (rojo) "Se detecta ausencia de barraje equipotencial…" norm "RETIE 2022, art. 15.3"; "Inspección preventiva" 12 abr 2026 (ámbar) "Breakers con calentamiento leve…"; "Instalación inicial" 20 ene 2026 (verde).
  - AC-01: "Diagnóstico correctivo" (188 A > 160 A nominal, norm "NTC 2050"); "Inspección preventiva" ene 2026.
  - TR-01: "Mantenimiento preventivo" + "Inspección termográfica" (ambos verdes, RETIE 2022).
  - SPT-01: "Medición de resistencia" (ámbar, "RETIE 2022, art. 15") + "Instalación inicial".
- Tipos de intervención presentes: instalación inicial, inspección preventiva, diagnóstico correctivo, mantenimiento preventivo, inspección termográfica, medición de resistencia.

### h) Toast
Bottom-center, forest, check lime: "Solicitud enviada: {activo}. Un técnico te contactará." (3.4s). Es la única "acción" real del prototipo — ambos CTA (normalización y certificación) terminan aquí.

## 2. Modelo de datos que implica el prototipo

- **Cliente (cuenta portal)** — nombre ("Edificio Torres del Parque"), rol del usuario ("Administración"), iniciales/avatar, agregados: nº activos, fecha última inspección, % en norma, conteo por semáforo.
- **Activo (asset)** — la entidad estrella. Campos visibles: código corto único (TB-01, AC-01, TR-01, SPT-01, TB-03), nombre, **tipo** (tablero, acometida, transformador, SPT — el icono depende del tipo), ubicación (zona dentro de la sede: Sótano/Cuarto eléctrico/Subestación/Piso 3/General), **estado semáforo actual** (Conforme/Pendiente/No cumple), fecha de última acta, y **specs técnicos tipados por clase de activo** (tensión V, corriente A, capacidad nominal A, potencia kVA, resistencia Ω, máximo de norma, observación).
- **Intervención / acta** (hoja de vida) — activo_id, tipo de intervención (los 6 listados arriba), fecha, resultado semáforo (ok/pend/no), descripción técnica, **referencia normativa** (texto tipo "RETIE 2022, art. 15.3" / "NTC 2050"), flag/URL de acta PDF.
- **Alarma / hallazgo activo** — título, activo (o ámbito "General"), severidad (crítica-roja / pendiente-ámbar), estado tag (No cumple/Pendiente), y **lista de riesgos tipados**: seguridad (electrocución, incendio), sanción normativa (RETIE/RETILAP + plazo), económico (con monto COP: multa estimada, sobrecosto mensual — renderizado en bold).
- **Revisión programada (agenda)** — fecha, objetivo (activo o grupo "Tableros piso 3–5"), tipo de trabajo.
- **Solicitud de servicio** — la que dispara el toast: activo/asunto, tipo (normalización | certificación RETIE), timestamp, estado ("un técnico te contactará").
- **Notificación** — implícita en la campana con dot.

## 3. Qué YA existe en ElectroScan 360 vs qué falta

### Ya existe (schema.ts + rutas apps/web/app)
| Prototipo | Existe hoy |
|---|---|
| Sede/edificio | `sites` (name, address, city, org) — el edificio ~ un site de la org GE |
| Inspección con resumen | `inspections` (status pipeline, tipoInstalacion, nivelTension, hdv snapshot, resumen ejecutivo, contactEmail, reportSentAt) |
| Alarmas (contenido) | `findings` (titulo, descripcion, estado NC/C/D/S, severidad alta/media/baja, confianza, gate, evidenceImageId, justificacion, review del ingeniero) |
| Chip de norma en timeline | `finding_citations` (quote validado contra `corpus_chunks.refPath` p.ej. `RETIE-2026:L3.A10.3.1`, ON DELETE RESTRICT) |
| Mediciones + vencimientos | `hdv_measurements` (tipo puesta_a_tierra/termografia/aislamiento, valor, fecha, **expiresAt** → pensado para VIEW v_alerts) — semilla natural de "Próximas revisiones" |
| "Ver acta digital (PDF)" | patrón `report_access_tokens` + rutas `/r/[token]` y `/r/[token]/pdf` (token opaco, expirable, revocable, downloadCount) |
| Auth interna | better-auth (`user/session/account/verification`, plugin admin) + `/login` + `/panel/*` |
| Evidencia fotográfica | `inspection_images` (EXIF probatorio, clasificación, OCR) |

### Falta (trabajo nuevo)
1. **Tabla `assets`** (organizationId, siteId, código, nombre, tipo, ubicación/zona, specs jsonb tipados por clase) + FKs `asset_id` en `findings` y `hdv_measurements` (hoy todo cuelga de `inspections`; no hay continuidad cross-inspección → sin activo no hay "hoja de vida").
2. **Semáforo**: estado actual por activo (derivable del último finding revisado por activo, o campo materializado `current_status`) + agregado por sede (gauge %, conteos V/A/R del hero y stats).
3. **Timeline "historial de intervenciones"**: query por asset uniendo inspecciones/findings/mediciones históricas + tipo de intervención (hoy no existe el concepto "tipo de acto": instalación, preventiva, correctivo, mantenimiento…).
4. **Agenda** (`scheduled_visits`): fecha, asset(s)/ámbito, tipo de trabajo. `hdv_measurements.expiresAt` da los vencimientos, pero la agenda del prototipo es de visitas planificadas, no de expiraciones.
5. **`service_requests`**: solicitudes de normalización/certificación desde el portal, con notificación al panel GE (y probablemente email/WhatsApp a técnicos).
6. **Riesgos cuantificados**: estructura tipada por finding (categoría seguridad/sanción/económico + monto COP + plazo). Hoy findings solo tienen descripcion/justificacion en prosa.
7. **Notificaciones** del cliente (campana).
8. **Acceso del cliente final** (ver punto 4) — hoy `user` es solo interno GE.
9. **Mapping de estados**: NC|C|D|S → Conforme/Pendiente/No cumple.

## 4. Ruta pública/auth recomendada para el portal

- **Fase 1 (recomendada): token opaco por cliente/sede**, replicando el patrón ya probado de `report_access_tokens` pero elevado de "una inspección" a "una sede": tabla `portal_access_tokens` (token randomBytes, siteId, organizationId, contactEmail, expiresAt largo p.ej. 90 días, revokedAt, lastAccessAt). Ruta `/p/{token}` (separada de `/r/{token}` que sigue siendo el informe único). Entrega por magic-link al `inspections.contactEmail` que ya se captura. Ventajas: cero fricción para un administrador de edificio, revocable/auditable, coherente con la spec §2 existente.
- **Fase 2: login better-auth con rol `client`** + tabla membership user↔site, solo si aparecen necesidades que lo justifiquen: múltiples usuarios por edificio, atribución fuerte de quién solicitó una normalización, o multi-sede con selector. better-auth ya está montado, así que el costo es moderado.
- Regla dura en cualquier caso: el portal **solo lee findings con gate aprobado/revisado** (el release gate de la spec §7 dice que todo entra como needs_review hasta ≥50 etiquetas del ingeniero) — nunca exponer al cliente hallazgos crudos del pipeline.
- Las acciones del portal (POST solicitud) deben ir rate-limited y ligadas al token (identidad implícita = contactEmail del token).

## 5. Gaps y ambigüedades a decidir con GE

1. **Origen del inventario de activos**: ¿los carga GE manualmente en el panel, o se derivan/sugieren desde la clasificación de imágenes del pipeline (inspection_images.clasificacion) con confirmación humana? Sin esto el portal nace vacío.
2. **Alcance del cliente**: ¿1 cliente = 1 edificio (como el prototipo) o hay administradoras con varias sedes? Cambia el modelo de acceso y si hace falta selector de sede.
3. **Semántica del semáforo**: el prototipo usa 3 estados; findings usa NC|C|D|S. ¿"D" (desviación) y "S" mapean a "Pendiente"? ¿"Pendiente" del prototipo = observación menor con plazo? Definir tabla de mapping canónica compartida panel↔portal.
4. **Cifras económicas** ($8–20M multa, $450.000/mes sobrecosto): ¿tabla paramétrica curada por GE por tipo de incumplimiento, o cálculo caso a caso del ingeniero? NO deben ser generadas libremente por el LLM (riesgo legal). Decidir si entran al MVP.
5. **"Acta" vs "informe"**: el prototipo llama "acta digital (PDF)" a lo que hoy es el informe de inspección de /r/{token}/pdf. ¿Son lo mismo o el acta es un documento firmado distinto (el proyecto se llama "gestiones-electricas-actas")? Afecta naming de entidades.
6. **Inconsistencias internas del prototipo**: gauge 72% ≠ 8/12 (66.7%) — ¿fórmula ponderada por severidad o solo número ilustrativo?; fila TB-03 abre el panel de TR-01 (bug); tabla muestra 5 de 12 activos sin paginación/"ver todos"; cita "RETIE 2022" cuando el corpus ingerido es edición 2026 — el chip de norma en producción debería salir de `finding_citations`→`corpus_chunks.refPath`.
7. **Canal de las solicitudes**: ¿a dónde llega "Solicitar normalización"? (bandeja en /panel, email n8n, WhatsApp). Definir SLA del "un técnico te contactará".
8. **Agenda**: ¿quién programa las visitas (GE desde el panel) y se muestran read-only al cliente, o el cliente puede pedir reagendar?
9. **Alarma sin activo** ("Señalización · Cuarto eléctrico · General"): confirma que las alarmas pueden tener ámbito sede/zona sin asset — el modelo debe permitir asset_id NULL con scope textual.
10. **Certificación RETIE**: el CTA implica un flujo de negocio (cotizar/agendar certificación) que hoy no existe en la spec — definir si es solo un lead o un estado del site.
11. **Branding**: la paleta lime/forest + Hanken Grotesk del prototipo es identidad GE (cliente), distinta del design-system del panel interno — confirmar que el portal usa esta identidad (consistente con la regla "identidad de cliente ≠ identidad FourG").
