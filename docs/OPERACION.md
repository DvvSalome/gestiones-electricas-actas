# Operación — Acta Digital + ElectroScan 360

Runbook del sistema integrado. Arquitectura: `docs/adr/0001-un-motor-varias-puertas.md`.
Historia de la integración: `docs/integracion/BACKLOG.md` (bitácora completa).

## URLs

| Qué | URL |
|---|---|
| Acta (técnicos) | https://actas.gestioneselectricas.com (`/` → `/actas`; admin en `/admin`) |
| Motor + panel | https://electroscan.gestioneselectricas.com (`/panel`, `/panel/dashboard`, `/panel/solicitudes`, `/panel/control`) |
| Portal cliente | `…/p/{token}` (se genera con el botón "Portal cliente" del dashboard, por sede) |
| Salud | `…/api/health` en ambos dominios |

## Deploys

- **Motor (repo `electroscan360`)**: push a `main` → GitHub Actions (typecheck+build) →
  deploy web+worker en Coolify. **El worker aplica las migraciones drizzle al arrancar**
  (nunca `drizzle-kit push`; siempre `generate` + commit).
- **Acta (este repo)**: `.github/workflows/deploy.yml` existe pero necesita los secrets
  `COOLIFY_TOKEN` + `COOLIFY_URL` (copiarlos del repo electroscan360). Mientras tanto:
  deploy manual con `GET {COOLIFY_URL}/api/v1/deploy?uuid=qdw6pcfrtjvaqdlb14n3g6uo`.

## Backups (F8.1)

- Cron diario 03:10 en el VPS: `/usr/local/bin/electroscan-backup.sh`
  (`/etc/cron.d/electroscan-backup`, log en `/var/log/electroscan-backup.log`).
- Contenido: `pg_dump -Fc` de la DB completa (motor + schema `actas`) + tar de
  `/data/actas/uploads` y `/data/electroscan/uploads`. Retención 7 días en
  `/var/backups/electroscan/`.
- **Restore**: `createdb restore_test && pg_restore -U electroscan -d restore_test --no-owner db-FECHA.dump`
  (probado 2026-07-19 con conteos idénticos). Uploads: `tar xzf uploads-FECHA.tgz -C /data`.
- Mejora pendiente: copia off-host (hoy vive en el mismo disco).

## Corpus normativo

- Cargado: **RETIE 2026** (601), **RETILAP 2026** (429), **NTC 2050** (3.578) = 4.608
  fragmentos con embedding. Las tres normas que pide la guía del cliente.
- Ingesta (dentro del contenedor del worker, que ya tiene `tsx` y credenciales):
  `docker cp <pdf> <worker>:/tmp/x.pdf` → `tsx scripts/ingest-corpus.ts load --doc <k> --pdf /tmp/x.pdf`
  → `tsx scripts/ingest-corpus.ts embed --doc <k>`.
- Comprobar que una norma se recupera: `tsx scripts/check-retrieval.ts "consulta" 6`.
- ⚠️ **NTC 2050 tiene `quotable = false`** (norma ICONTEC con derechos reservados):
  el motor la usa y la cita por referencia, pero su texto literal NO se imprime en
  informes ni portal. Ver `electroscan360/docs/adr/0002-corpus-normas-privadas.md`.

## Incidentes conocidos

- **Pipeline colgado / worker redeployado a mitad de corrida**: pg-boss deja el job
  zombi (singletonKey + expire 30 min). Receta: `UPDATE pgboss.job SET state='cancelled'`
  del job activo, marcar `pipeline_runs` failed, y la inspección vuelve a `submitted`.
- **Cert LE no emite tras cambio DNS**: los resolvers de Let's Encrypt cachean el A
  viejo hasta que expira el TTL y hay rate-limit de 5 intentos/hora — Traefik reintenta
  solo con el tráfico entrante; NO martillar.
- **El acta sin señal**: funciona offline (cola IndexedDB, borradores coalescidos);
  al volver la señal sincroniza solo. Sin motor: el diagnóstico degrada con mensaje y
  el acta sigue.
- **Swap de modelo LLM**: `UPDATE model_config` en la DB (prefijo `openrouter:` para
  OpenRouter; sin prefijo = Vertex). Sin deploy.

## Seguridad

- Acta: PIN técnico (sesión 30d) / admin 12h; toda la API con sesión; CORS cerrado a
  orígenes propios; headers nosniff/frame-deny/referrer (F8.2); rate limits por IP.
- Motor↔Acta: `MOTOR_SERVICE_TOKEN` (header `x-service-token`) SOLO para: crear
  inspección, leer eventos, review. Las operaciones destructivas/administrativas
  (merge de sedes, tokens de portal, OTs, visitas) exigen sesión de panel.
- Portal: el token opaco es la credencial (revocable, expira 180d, `lastAccessAt`);
  solicitudes con rate limit 8/h por token y dedupe.

## Pendientes de Adrián (únicos restos de F8)

1. **Vercel viejo del acta**: pausar/borrar el proyecto en SU cuenta Vercel y revocar
   `BLOB_READ_WRITE_TOKEN` (riesgo: bookmarks viejos a `*.vercel.app` escriben donde
   nadie lee). El DNS ya apunta al VPS.
2. **Rotar token Coolify** (quemado en chat) y **OpenRouter** (ídem) — se crean en sus
   respectivos dashboards; actualizar el secret `COOLIFY_TOKEN` del repo electroscan360
   y el env `OPENROUTER_API_KEY` en Coolify.
3. Copiar secrets `COOLIFY_*` a este repo para el push-deploy automático (1 min).
4. Nombres de los técnicos reales para crear sus PINs (hoy: `tecnico1`).

*(cPanel: el token viejo hardcodeado ya fue revocado y el script `deploy-cpanel.sh`
usa `CPANEL_TOKEN` por env — hecho en F8.2.)*
