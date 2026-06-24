# Gestiones Eléctricas — Plataforma Digital

> Plataforma interna para **Gestiones Eléctricas SAS** que centraliza la gestión de actas técnicas, revisión de contenido multimedia y exposición de datos vía API REST + servidor MCP para integraciones con Claude AI.

## 📦 Módulos

| Módulo | Puerto | Descripción |
|--------|--------|-------------|
| `api/` | 3001 | Backend REST (Express + SQLite) |
| `mcp/` | stdio | Servidor MCP para Claude |
| `web/` | 8080 | Frontend (revisor de contenido) |
| `web/acta.html` | 8081 | Acta técnica digital |

## 🚀 Setup rápido

### Prerequisitos
- Node.js 20+
- npm 9+

### Instalar y ejecutar

```bash
# 1. API REST
cd api && npm install && npm start
# → http://localhost:3001

# 2. MCP Server (configurar en Claude Desktop)
cd mcp && npm install

# 3. Servidor web de contenido
cd ..
python3 -m http.server 8080 --bind 0.0.0.0
# → http://TU_IP:8080/web/revisor/index.html
```

## 🤖 Integración con Claude (MCP)

Agrega esto en `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gestiones-electricas": {
      "command": "node",
      "args": ["/ruta/absoluta/al/proyecto/mcp/src/index.js"],
      "env": {
        "GE_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

Luego reinicia Claude Desktop y podrás decirle:
- *"¿Qué videos faltan por revisar?"*
- *"Aprueba el anuncio 06 con comentario: perfecto"*
- *"Muéstrame el reporte de revisiones"*
- *"Cuántas actas técnicas se han registrado"*

## 📋 API Reference

### Reviews
```
GET    /api/reviews              Lista todas las revisiones
GET    /api/reviews/:filename    Revisión de un video
POST   /api/reviews/:filename    Crear/actualizar revisión
DELETE /api/reviews/:filename    Borrar revisión
GET    /api/reviews/report       Reporte completo en JSON
```

### Assets
```
GET    /api/assets/videos        Lista de videos
GET    /api/assets/images        Lista de imágenes por categoría
```

### Actas
```
GET    /api/actas                Lista de actas
POST   /api/actas                Crear acta
GET    /api/actas/:id            Acta específica
PATCH  /api/actas/:id/status     Actualizar estado
```

## 🗂️ Estructura del proyecto

```
ge-plataforma/
├── api/                  ← REST API (Express + SQLite)
├── mcp/                  ← MCP Server para Claude
├── web/                  ← Frontend HTML
│   ├── revisor/          ← Revisor de videos/imágenes
│   └── acta.html         ← Acta técnica digital
├── .github/
│   └── ISSUE_TEMPLATE/   ← Templates de tickets
├── README.md
└── ROADMAP.md
```

## 🎯 Roadmap

Ver [ROADMAP.md](./ROADMAP.md)

## 👥 Equipo

- **Isaias** — Desarrollo & IA
- **Wilmar** — Producción & Coordinación

---

*Gestiones Eléctricas SAS — Soluciones de Ingeniería Eléctrica*
