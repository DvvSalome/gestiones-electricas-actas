# ADR 0001 — Un motor, varias puertas

**Fecha:** 2026-07-19 · **Estado:** aceptado e implementado (integración F1–F8)

## Contexto

Gestiones Eléctricas definió la arquitectura en 3 guías de pizarra: *"El Acta
recoge. El Motor diagnostica"*. El PDF es lo que se lleva el cliente; **los
datos son la empresa**. Existían dos sistemas separados (Acta Digital en Vercel
+ ElectroScan 360 en el VPS) y dos prototipos de portal sin backend.

## Decisión

Un solo motor (ElectroScan 360: pipeline MoE + RAG RETIE + validador de citas,
PostgreSQL único) y varias **puertas** que lo consumen:

| Puerta | Quién | Cómo entra |
|---|---|---|
| **Acta Digital** (`actas.gestioneselectricas.com`) | Técnico en campo | PIN 30d; el diagnóstico IA viaja por proxy servidor-a-servidor (`MOTOR_SERVICE_TOKEN`) — el browser nunca ve el motor |
| **Panel** (`electroscan…/panel`) | Ingeniero/admin GE | Sesión better-auth; inspecciones, dashboard, solicitudes, agenda, centro de control |
| **Portal del Cliente** (`/p/{token}`) | Cliente final | Token opaco por sede, revocable, con expiración |
| **Informe** (`/r/{token}` interno · `/p/{token}/informe/{id}` cliente) | Cliente | Token; la variante cliente filtra `soloRevisados` |

## Reglas duras (correcciones del crítico — NO negociables)

1. **Inspección por DIAGNÓSTICO, nunca por OT**: el pipeline borra findings al
   re-correr; el vínculo vive en `acta_fotos.inspection_id`.
2. **Nada sin validar llega al cliente**: portal, informe cliente, leads y
   semáforos filtran `goldenLabel='correcto'`. Los hallazgos crudos son
   internos (podrían ser alucinaciones).
3. **`findings` es evidencia histórica intocable**: los cierres viven en
   `work_orders` (tipo S→verde, D→ámbar). Mutar `findings.estado` reescribiría
   informes ya entregados.
4. **La foto original con EXIF se sube tal cual** (el canvas comprimido queda
   solo para preview/PDF).
5. **El PIN cierra el POST anónimo en el mismo deploy** (sin ventana abierta).

## Flujo completo (verificado e2e en prod)

Acta (técnico, con activo seleccionado) → foto original → diagnóstico bajo
demanda → hallazgos con citas RETIE → técnico valida sí/no/porqué (alimenta el
aprendizaje y el golden set del gate auto_accept) → hoja de vida del activo
(semáforo) → portal del cliente (gauge, alarmas, agenda, drawer, informe
filtrado) → solicitud del cliente → email a GE + lead en el centro de control →
OT asignada → cierre S/D → el lead sale del funnel y el semáforo mejora.

## Consecuencias

- Un solo Postgres (schema `public` motor + schema `actas`) hace JOIN reales
  (timeline, intervenciones) sin ETL. Rol `electroscan_app` lee `actas.actas`
  (grant mínimo); `actas_app` es dueño de su schema.
- El acta funciona offline (cola IndexedDB) y sin motor (degrada con mensaje).
- Backups de TODO en un pg_dump + tar de uploads (ver OPERACION.md).
