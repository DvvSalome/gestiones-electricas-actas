# proto-centro

## Resumen
El prototipo `prototipo-centro-control-GE.html` es un dashboard interno single-page (solo Dashboard implementado; 6 secciones más como navegación estática) que reposiciona los hallazgos NC de ElectroScan como "leads de normalización": cada no-conformidad detectada se muestra como oportunidad comercial con valor estimado en COP y un CTA "Asignar" que crea una orden de trabajo. Introduce 4 conceptos que NO existen en el código actual de ElectroScan 360: valor monetario por hallazgo, planes de suscripción por cliente (MRR), órdenes de trabajo con técnico asignado, y alarmas "en tiempo real" — mientras que reutiliza directamente conceptos ya implementados (findings NC con citas, sites/sedes, alertas de mediciones HDV, % de conformidad ≈ site scores A-D, actas/informes con cierres D/S).

## Hallazgos clave
- El funnel implícito es: hallazgo NC → lead priorizado (hot/warm) con valor estimado COP → 'Asignar' → orden de trabajo con técnico → cierre del hallazgo. ElectroScan ya cubre los dos extremos (findings NC en `packages/core/src/schema.ts:228-251` y cierres D='Cierre documental'/S='Cierre en sitio' en `packages/delivery/src/report-html.ts:54-57`), pero TODO el tramo comercial del medio (lead, valor, cotización, orden de trabajo, asignación) no existe en el schema.
- Las 'Alarmas en tiempo real' del prototipo son en realidad los mismos hallazgos NC re-presentados (misma data: 'sin barraje SPT' aparece como lead, como alarma y como '2 en riesgo' del cliente Torres del Parque) — no implica telemetría IoT nueva sino una vista de severidad sobre findings + las alertas de vencimiento HDV que ya existen en `dashboard.ts:getAlerts()`.
- El prototipo introduce monetización recurrente: KPI 'Ingresos recurrentes (MRR) $14.2M COP' y columna 'Plan' (Monitoreo Básico/Pro/Empresarial) por cliente — nada de esto existe; `organizations`/`sites` no tienen campo plan ni billing. Es una decisión de producto (SaaS por suscripción para GE hacia sus clientes) que hay que validar con Wilman.
- La columna 'Conformidad %' (72%/88%/94%/100%) y los estados 'en riesgo'/'Conforme'/'Certificado' mapean casi 1:1 al `getSiteScores()` existente (score A-D por NC abiertos + mediciones vencidas, `dashboard.ts:47-78`), pero el prototipo lo agrega por CLIENTE (organización) y no por sede — hoy el dashboard es single-tenant-operador; el Centro de Control implica vista multi-cliente desde GE.
- El botón 'Asignar' simula crear 'Orden de trabajo creada para X · técnico por asignar' (JS línea 338-344) — implica entidades nuevas: work_orders, technicians/asignaciones, y un vínculo finding→lead→work_order→cierre que retroalimente el estado D/S del acta.
- Los valores por lead (~$3.5M barraje SPT, ~$6.2M acometida, ~$18M certificación RETIE completa, ~$1.8M señalización RETILAP) sugieren un catálogo de precios por tipo de normalización — conecta natural con el skill existente `fourg-skills:gestiones-electricas-cotizacion`.

## Riesgos
- Conflicto de rol/incentivo: el mismo sistema que certifica conformidad (acta RETIE imparcial) genera leads comerciales para que GE venda la corrección — hay que separar claramente el informe técnico probatorio del pipeline comercial, o GE puede comprometer la credibilidad del acta.
- El prototipo vende 'Alarmas en tiempo real' y 'monitoreo' (412 activos monitoreados, planes de Monitoreo) pero ElectroScan es batch por inspección — sin hardware/telemetría eso es marketing engañoso o requiere redefinir 'tiempo real' como 'alertas de vencimiento + NC recientes'.
- Los valores COP por lead están hardcodeados en el prototipo; sin catálogo de precios real ni flujo de cotización aprobado por Wilman, el KPI '$32M en oportunidades' es ficción de demo.
- El modelo multi-cliente (34 clientes con planes) implica multi-tenancy real con billing que no existe; hoy `organizations` es solo agrupador — implementarlo es un proyecto en sí (facturación NO existe en ElectroScan, y el flujo de facturación de fourg-docs es de FourG, no de GE).
- Riesgo de scope creep en F0: el prototipo agrega 4 subsistemas nuevos (CRM de leads, órdenes de trabajo, planes/MRR, entidad Activos con IDs tipo TB-01/AC-01/TR-02) sobre un producto cuya fase actual es blindaje+fundaciones.

## Detalle
# Análisis del prototipo `prototipo-centro-control-GE.html`

Archivo: `D:/TRABAJOS PROPIOS/projects/electroscan360/prototipo-centro-control-GE.html` (347 líneas, HTML+CSS+JS vanilla, fuente Hanken Grotesk/Gill Sans, paleta lime `#C9E400` + forest `#2B3000` — branding GE, no FourG). Es un mock estático de una sola vista (Dashboard) con un único comportamiento interactivo (toast al "Asignar").

## 1. Inventario exacto de pantallas / secciones / tablas / KPIs

### 1.1 Sidebar (nav, líneas 136-162)
7 ítems de navegación — **solo "Dashboard" está implementado**; el resto es aspiracional:
- **Dashboard** (active)
- **Clientes**
- **Alarmas** — badge rojo `7`
- **Normalizaciones** — badge rojo `4`
- **Actas**
- **Activos**
- **Reportes**
- Footer de usuario: avatar "GE", **"Wilman · Admin"**, org "Gestiones Eléctricas" → confirma que el usuario objetivo es Wilman (el cliente dueño de GE) como operador admin.

### 1.2 Topbar (líneas 166-175)
- Título "Centro de control" + subtítulo con métricas de contexto: **"Lunes, 20 de julio · 34 clientes activos · 412 activos monitoreados"**.
- 2 acciones globales: **"Nuevo cliente"** (secundario) y **"Nueva acta"** (primario) → la creación de acta es la acción principal del sistema.

### 1.3 Fila de 4 KPIs (líneas 180-201)
| KPI | Valor | Trend/subtexto |
|---|---|---|
| Ingresos recurrentes (MRR) | **$14.2M** | +18% vs mes anterior · COP |
| Normalizaciones pendientes | **4** | **$32M COP en oportunidades** |
| Alarmas activas | **7** (en rojo) | 3 críticas · 4 pendientes |
| Actas este mes | **86** | +12 vs julio pasado |

### 1.4 Card "Solicitudes de normalización" (leads, líneas 205-246)
Etiquetada explícitamente **"Leads calientes"**. 4 filas, cada una con: barra de prioridad (`hot` roja / `warm` ámbar), título del hallazgo, cliente + tipo de instalación, **valor estimado**, antigüedad, y botón CTA **"Asignar"**:

| Prioridad | Hallazgo (lead) | Cliente · tipo | Valor | Antigüedad |
|---|---|---|---|---|
| hot | Tablero general TB-01 · sin barraje SPT | Torres del Parque · Propiedad horizontal | ~$3.5M | 12 min |
| hot | Acometida AC-01 · sobrecarga | Torres del Parque · Propiedad horizontal | ~$6.2M | 12 min |
| hot | Certificación RETIE completa | Industrias del Caribe SAS · Industrial | ~$18M | 1 h |
| warm | Señalización RETILAP · cuarto eléctrico | Centro Comercial Viva · Comercial | ~$1.8M | 3 h |

Nota: la suma (3.5+6.2+18+1.8 ≈ $29.5M) no cuadra exactamente con el KPI "$32M en oportunidades" — es mock.

### 1.5 Card "Alarmas en tiempo real" (líneas 249-280)
Feed de 5 visibles (badge dice 7). Severidad por color de dot (rojo=crítica, ámbar=advertencia):

| Sev | Alarma | Cliente · activo | Hace |
|---|---|---|---|
| roja | Sobrecarga en acometida | Torres del Parque · AC-01 | 12 min |
| roja | SPT sin barraje equipotencial | Torres del Parque · TB-01 | 12 min |
| roja | Transformador sobrecalentando | Industrias del Caribe · TR-02 | 1 h |
| ámbar | Señalización incompleta | CC Viva · General | 3 h |
| ámbar | Breaker con calentamiento leve | Bodega Norte · TB-04 | 5 h |

**Observación clave:** las alarmas rojas 1, 2 y 4 son LOS MISMOS hallazgos que aparecen como leads (mismo cliente, mismo activo, misma antigüedad). El prototipo está diciendo: *hallazgo crítico = alarma = lead comercial*, tres vistas del mismo dato.

### 1.6 Tabla "Clientes y estado de conformidad" (líneas 284-329)
5 filas visibles de 34 ("Ver los 34 clientes"). Columnas: **Cliente** (nombre + tipo de instalación), **Plan**, **Activos** (conteo), **Conformidad** (barra % con color semafórico), **Estado** (pill):

| Cliente | Tipo | Plan | Activos | Conformidad | Estado |
|---|---|---|---|---|---|
| Edificio Torres del Parque | Propiedad horizontal | Monitoreo Pro | 12 | 72% (ámbar) | 2 en riesgo |
| Industrias del Caribe SAS | Industrial | Monitoreo Empresarial | 58 | 88% (oliva) | 1 en riesgo |
| Centro Comercial Viva | Comercial | Monitoreo Pro | 31 | 94% (verde) | Conforme |
| Bodega Norte Logística | Industrial | Monitoreo Básico | 19 | 90% (oliva) | Conforme |
| Hotel Playa Dorada | Hotelería | Monitoreo Pro | 27 | 100% (verde) | **Certificado** |

Escala de estados implícita: `en riesgo` (NC abiertos) → `Conforme` (sin NC) → `Certificado` (100%, presumiblemente con certificación RETIE vigente). 3 tiers de plan: **Monitoreo Básico / Pro / Empresarial**.

### 1.7 Interactividad (líneas 334-345)
Único JS: `assign(client)` muestra toast **"Orden de trabajo creada para {cliente} · técnico por asignar"**. Es la semilla del flujo lead → orden de trabajo → asignación de técnico.

## 2. Modelo de datos implicado por el prototipo

Entidades que el prototipo asume (⭐ = no existe hoy en ElectroScan):

- **Cliente** (≈ `organizations`, existe): nombre, **tipo de instalación** (Propiedad horizontal / Industrial / Comercial / Hotelería), ⭐**plan de suscripción** (Básico/Pro/Empresarial → base del MRR), estado agregado de conformidad.
- ⭐**Activo** (equipment): identificadores tipo `TB-01` (tablero), `AC-01` (acometida), `TR-02` (transformador), `TB-04` (breaker/tablero). Hoy no hay tabla de activos — los findings referencian imágenes, no equipos con ID persistente. El nav tiene sección "Activos" dedicada y el subtítulo dice "412 activos monitoreados".
- ⭐**Lead de normalización**: derivado de un hallazgo NC. Atributos: título (hallazgo + activo), cliente, prioridad (`hot`/`warm` — presumiblemente derivada de severidad del finding), **valor estimado COP**, timestamp de origen, estado del funnel. Estados implícitos del funnel: `nuevo/pendiente` → `asignado` (orden creada, técnico por asignar) → [implícito: cotizado → aprobado → ejecutado → cerrado]. El prototipo solo muestra la primera transición.
- ⭐**Orden de trabajo**: creada desde el lead; campo `técnico` (nullable al crear: "técnico por asignar"). Implica entidad **técnico/asignación**.
- ⭐**Alarma**: unión de (a) findings NC recientes con severidad y (b) condiciones operativas ("sobrecalentando", "calentamiento leve" — lenguaje de monitoreo continuo). Severidad crítica/advertencia, estado activa/pendiente, timestamp.
- **Acta** (existe como inspección+informe): contador mensual (86), acción "Nueva acta".
- ⭐**Métrica financiera**: MRR por planes + pipeline comercial ($ en oportunidades). Requiere precios de plan y catálogo de precios de normalización.

## 3. Mapeo contra ElectroScan 360 existente y el acta digital

Verificado contra `packages/core/src/schema.ts`, `packages/core/src/dashboard.ts` y `packages/delivery/src/report-html.ts`:

| Concepto del prototipo | ¿Existe en ElectroScan 360? | Dónde / gap |
|---|---|---|
| Hallazgos NC | ✅ Sí | `findings` (schema.ts:228-251): `estado NC\|C\|D\|S`, `severidad alta\|media\|baja`, `confianza`, `gate` (needs_review), evidencia fotográfica, `goldenLabel` del ingeniero. |
| Citas normativas por hallazgo | ✅ Sí | `finding_citations` (schema.ts:254-269) → `corpus_chunks` (RETIE/RETILAP/NTC2050) con quote + validación. El prototipo NO muestra citas — el Centro de Control las tendría "gratis". |
| Sedes / clientes | ✅ Parcial | `organizations` + `sites` (schema.ts:25, 92-101). Falta: tipo de instalación a nivel cliente (existe `tipoInstalacion` pero en `inspections`), plan, y la vista agregada POR CLIENTE (hoy `getSiteScores()` agrega por sede). |
| Conformidad % / estado | ✅ Equivalente | `getSiteScores()` (dashboard.ts:47-78): score A/B/C/D por NC abiertos + mediciones vencidas. El prototipo lo expresa como % — es re-presentación, no dato nuevo. |
| Alarmas | ✅ Parcial | `getAlerts()` (dashboard.ts:15-34): mediciones HDV vencidas/por vencer (60 días). Las alarmas por NC crítico serían una query nueva sobre `findings` (severidad alta + estado NC). Lo que NO existe: telemetría en tiempo real. |
| Actas / informes | ✅ Sí | Inspección (schema.ts:103-126, status draft→…→completed) + informe PDF formato acta (`report-html.ts`): tabla de no conformidades "formato acta de inspección" (línea 125), acta de apertura/cierre con asistentes (línea 191), anexo fotográfico. |
| Cierre de hallazgos D/S | ✅ Sí — punto de conexión clave | `report-html.ts:54-57`: `NC='No cumple' (cierre S)`, `D='Cierre documental'`, `S='Cierre en sitio'`; conteos en líneas 81-82. El enum `NC\|C\|D\|S` también está en el structured output del pipeline IA (`packages/ai/src/experts.ts:192,214`). **El cierre del ciclo comercial del prototipo (normalización ejecutada) ya tiene destino natural: transicionar el finding de NC → D o S.** |
| Leads con valor COP | ❌ No | No hay tabla de leads, ni catálogo de precios, ni campo de valor. Conecta con el skill `fourg-skills:gestiones-electricas-cotizacion` como fuente de precios. |
| Órdenes de trabajo / técnicos | ❌ No | `user` existe (Better Auth) pero sin rol técnico ni asignaciones a trabajos de corrección. |
| Planes / MRR / facturación | ❌ No | Ningún concepto de billing en el repo. (El flujo de facturación que sí existe en el ecosistema es el de fourg-docs/Supabase — es de FourG para sus cotizaciones, NO transferible directo aquí.) |
| Activos con ID (TB-01, TR-02…) | ❌ No | Los findings anclan a `inspection_images`, no a equipos persistentes entre inspecciones. Sin tabla de activos no hay "412 activos monitoreados" ni histórico por equipo. |

## 4. Flujo de negocio implicado

```
Inspección (acta digital) 
  → pipeline IA F1-F5 detecta finding estado=NC (con cita RETIE/RETILAP + evidencia foto)
  → [NUEVO] el NC severidad alta se materializa como LEAD de normalización
      (prioridad hot/warm ≈ severidad; valor estimado desde catálogo de precios)
  → [NUEVO] también dispara ALARMA en el feed (mismo dato, vista operativa)
  → Wilman ve el lead en el Centro de Control → "Asignar"
  → [NUEVO] se crea ORDEN DE TRABAJO (cotización → aprobación del cliente → ejecución por técnico)
  → al ejecutar/documentar la corrección, el finding transiciona NC → S (cierre en sitio) 
      o NC → D (cierre documental)  ← campos que YA existen en acta/informe
  → la conformidad del cliente sube (72% → …) y eventualmente pasa a Conforme/Certificado
  → el ciclo alimenta el KPI de MRR (plan de monitoreo) + ingresos por normalización
```

El modelo de negocio implícito es de doble ingreso: (1) **recurrente** — planes de monitoreo (Básico/Pro/Empresarial → MRR), y (2) **transaccional** — trabajos de normalización originados por los propios hallazgos de la plataforma. El diagnóstico IA es el motor de generación de demanda: cada NC es un presupuesto potencial.

## 5. Decisiones abiertas

1. **¿Lead automático o curado?** ¿Todo finding NC con gate `needs_review` genera lead, o solo después de que el ingeniero valida (`goldenLabel='correcto'`)? Recomendado: solo post-validación, para no cotizar sobre alucinaciones (el release gate de spec §7 ya bloquea auto-accepted).
2. **Catálogo de precios**: ¿de dónde salen los ~$3.5M/~$18M? ¿Tabla de precios por tipo de normalización mantenida por Wilman, o cotización manual por lead (integrando el skill `gestiones-electricas-cotizacion`)?
3. **Separación acta ↔ comercial**: ¿el informe/acta entregado al cliente menciona la oferta de corrección, o el pipeline comercial vive solo en el Centro de Control interno? (Riesgo de imparcialidad del acta.)
4. **"Tiempo real" y "monitoreo"**: ¿hay plan de hardware/IoT (los textos "sobrecalentando", "412 activos monitoreados" lo sugieren) o se redefine como alertas de vencimiento + NC de inspecciones periódicas? Afecta el naming de los planes ("Monitoreo X").
5. **Entidad Activo**: ¿se introduce tabla `assets` (TB-01, TR-02…) con findings anclados a activo para histórico entre inspecciones? Es prerequisito de "Activos" en el nav y del conteo por cliente.
6. **Multi-cliente + billing**: ¿los 34 clientes son organizations dentro del tenant GE? ¿Quién cobra los planes y con qué pasarela? Nada de esto está en la spec de F0.
7. **Estados del funnel de lead**: el prototipo solo muestra nuevo→asignado. Falta definir el resto (cotizado, aprobado, ejecutado, perdido) y quién los mueve.
8. **"Certificado" como estado**: ¿implica registrar vigencia de certificación RETIE por cliente/sede (fecha + vencimiento → nueva fuente de alertas)?
9. **Alcance vs fase actual**: el proyecto está en F0 (blindaje+fundaciones). ¿Este Centro de Control es la evolución del dashboard existente (`dashboard.ts`) o un app separada? Lo más barato: extender el dashboard actual con la vista de leads sobre findings NC + tabla work_orders mínima, y diferir planes/MRR/activos.
