# Gestiones Eléctricas — Actas Técnicas

> Formulario digital de **actas técnicas** + panel administrativo de trazabilidad para **Gestiones Eléctricas SAS**. Los técnicos levantan el acta en campo (mobile-first) y el administrador revisa el historial desde el panel.
>
> Producción: **https://actas.gestioneselectricas.com** (`/` = formulario · `/admin` = panel).

## 📦 Estructura

| Ruta | Qué es |
|------|--------|
| `web/index.html` | Formulario del acta técnica (mobile-first, GPS + minimapa, firma, checklist, fotos, PDF client-side) |
| `web/admin.html` | Panel de trazabilidad (login, listado y descarga de actas, gestión de usuarios) |
| `web/js/` | Lógica del formulario y del panel |
| `web/api/` · `api/` | Funciones serverless de Vercel (`forms`, `auth`) que persisten en Vercel Blob |
| `apps/actas/` | Backend Express + Postgres (evolución para VPS: mismo contrato de API, persistencia real de fotos/firma/checklist) |

## 🚀 Ejecución

### Modo Vercel (producción actual)
Sitio estático en `web/` + funciones serverless en `api/`. Requiere la env var `BLOB_READ_WRITE_TOKEN` (Vercel Blob). Deploy con `vercel deploy --prod` desde la raíz.

### Modo Express + Postgres (`apps/actas/`)
```bash
cd apps/actas
npm install
# requiere DATABASE_URL (Postgres) + BLOB/almacenamiento de fotos
npm start          # → http://localhost:3000  (/ redirige a /actas, /admin = panel)
```

## 🔌 API (contrato)

```
POST   /api/auth                 login / cambio de contraseña / gestión de usuarios (panel)
GET    /api/forms                lista de actas (requiere sesión admin)
POST   /api/forms                registrar/actualizar resumen de acta
POST   /api/actas                acta completa (fotos, firma, checklist) — apps/actas
GET    /api/actas-full           evidencia por OT (panel)
GET    /api/health               estado del servicio
```

## 🗂️ Rutas del sitio

```
/          → formulario del acta
/actas     → formulario del acta
/admin     → panel de trazabilidad
```

## 🎯 Roadmap

Ver [ROADMAP.md](./ROADMAP.md) y `docs/integracion/`.

## 👥 Equipo

- **Isaias** — Desarrollo & IA
- **Adrián** — Desarrollo backend / integración

---

*Gestiones Eléctricas SAS — Soluciones de Ingeniería Eléctrica*
