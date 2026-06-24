# 📄 Documentación Técnica: API REST & MCP Server
## Gestiones Eléctricas SAS — Plataforma Digital

Esta documentación cubre la arquitectura backend, los endpoints de la API REST y la configuración del servidor MCP (Model Context Protocol) para integraciones con Claude Desktop.

---

## ⚡ 1. API REST (Backend)

La API está desarrollada en **Node.js (Express)** y utiliza **SQLite** (a través de `better-sqlite3`) para la persistencia.
* **URL Base en Local:** `http://localhost:3001`
* **URL Base en Red LAN:** `http://IP_DE_TU_MAQUINA:3001`

### 📹 Módulo: Revisiones de Videos (`/api/reviews`)

#### `GET /api/reviews`
Obtiene el listado completo de revisiones guardadas.
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "total": 28,
    "pendientes": 10,
    "aprobados": 15,
    "rechazados": 3,
    "reviews": [
      {
        "filename": "02.mp4",
        "approved": true,
        "comment": "Simulación ETAP aprobada por Wilmar",
        "reviewer": "Wilmar",
        "created_at": "2026-06-24T02:00:00.000Z",
        "updated_at": "2026-06-24T02:30:00.000Z"
      }
    ]
  }
  ```

#### `GET /api/reviews/:filename`
Obtiene la revisión de un archivo de video específico.
* **Parámetro URL:** `:filename` (ej. `02.mp4` o `ok%2009.mp4`)
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "filename": "02.mp4",
    "approved": true,
    "comment": "Comentario de revisión",
    "reviewer": "compañero",
    "created_at": "2026-06-24T02:00:00.000Z",
    "updated_at": "2026-06-24T02:30:00.000Z"
  }
  ```

#### `POST /api/reviews/:filename`
Crea o actualiza la revisión de un video.
* **Payload (JSON):**
  ```json
  {
    "approved": true, 
    "comment": "Calidad excelente, aprobado para subir",
    "reviewer": "Wilmar"
  }
  ```
  *(Nota: `approved` puede ser `true` para aprobado, `false` para rechazado o `null` para pendiente).*
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "success": true,
    "review": {
      "filename": "02.mp4",
      "approved": true,
      "comment": "Calidad excelente, aprobado para subir",
      "reviewer": "Wilmar",
      "updated_at": "2026-06-24T04:30:00.000Z"
    }
  }
  ```

#### `DELETE /api/reviews/:filename`
Elimina la revisión de un video.
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "success": true,
    "deleted": "02.mp4"
  }
  ```

#### `GET /api/reviews/report`
Genera un reporte markdown o JSON de todas las revisiones.
* **Query Params:** `?format=markdown`
* **Respuesta (Texto Plano - 200 OK):**
  ```markdown
  # Reporte de Revisión de Videos — Gestiones Eléctricas
  Generado: 24/06/2026, 04:30:00
  
  | Video | Estado | Comentario | Revisor |
  | :--- | :---: | :--- | :--- |
  | `01.mp4` | 🟢 Aprobado | Excelente toma inicial | Wilmar |
  | `02.mp4` | ⏳ Pendiente | - | - |
  ```

---

### 🖼️ Módulo: Catálogo de Assets (`/api/assets`)

#### `GET /api/assets/videos`
Lista todos los archivos `.mp4` físicos en la carpeta de videos del proyecto, enriquecidos con su estado de revisión en la base de datos.
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "total": 28,
    "aprobados": 15,
    "rechazados": 3,
    "pendientes": 10,
    "videos": [
      {
        "filename": "01.mp4",
        "size_mb": "13.2",
        "modified": "2026-06-23T17:58:15.000Z",
        "review": { "approved": true, "comment": "Aprobado", "reviewer": "Wilmar", "updated_at": "..." }
      }
    ]
  }
  ```

#### `GET /api/assets/images`
Lista todas las imágenes corporativas y de campaña agrupadas por prefijo (`CIG` o `IMG`).
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "total": 39,
    "groups": 2,
    "images": {
      "CIG": [
        {
          "filename": "CIG01_TablerosInstalacion.png",
          "name": "CIG01 Tableros Instalacion",
          "size_kb": 1175,
          "modified": "2026-06-21T08:00:59.000Z"
        }
      ],
      "IMG": [...]
    }
  }
  ```

#### `GET /api/assets/stats`
Resumen de estadísticas cruzadas de la plataforma (videos, imágenes, actas, calificaciones).
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "assets": { "videos": 28, "images": 39 },
    "reviews": { "pendientes": 10, "aprobados": 15, "rechazados": 3 },
    "actas": { "total": 12, "calificacion_promedio": 4.8, "firmado": 8, "enviado": 4 }
  }
  ```

---

### 📋 Módulo: Actas Técnicas (`/api/actas`)

#### `GET /api/actas`
Lista todas las actas registradas en el sistema. Soporta filtros opcionales.
* **Query Params:**
  * `estado`: `borrador`, `firmado`, `enviado`
  * `tecnico`: Filtro por nombre de técnico (parcial)
  * `limit`: Cantidad máxima (defecto: 20)
* **Respuesta (JSON - 200 OK):**
  ```json
  {
    "total": 12,
    "returned": 1,
    "actas": [
      {
        "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "ot_number": "OT-1035",
        "fecha": "2026-06-23",
        "cliente": "Constructora del Caribe S.A.S",
        "tecnico": "Ing. Jose Sanchez",
        "estado": "firmado"
      }
    ]
  }
  ```

#### `POST /api/actas`
Registra un reporte de acta técnica digital (normalmente enviado desde el formulario `acta.html`).
* **Payload (JSON - Todos los campos requeridos excepto observaciones y calificación):**
  ```json
  {
    "ot_number": "OT-1035",
    "fecha": "2026-06-24",
    "tipo_visita": "diagnostico",
    "cliente": "Constructora del Caribe S.A.S",
    "contacto": "Pedro Perez",
    "telefono": "3001234567",
    "direccion": "Calle 79 # 53-22",
    "ciudad": "Barranquilla",
    "tecnico": "Ing. Jose Sanchez",
    "diagnostico": "Se detectó sobretemperatura de 45°C en la fase L3...",
    "acciones": "Ajuste de torque en bornes y limpieza general.",
    "observaciones": "Se sugiere programar termografía en 3 meses.",
    "calificacion": 5
  }
  ```
* **Respuesta (JSON - 201 Created):**
  ```json
  {
    "success": true,
    "acta": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "ot_number": "OT-1035",
      "cliente": "Constructora del Caribe S.A.S"
    }
  }
  ```

---

## 🤖 2. MCP Server (Integración con Claude Desktop)

El servidor MCP expone las funciones de la API como herramientas semánticas que Claude puede consumir directamente.

### ⚙️ Configuración en Claude Desktop

Abre el archivo de configuración de tu Claude Desktop (o tu compañero en su propia máquina):
* **Ruta en macOS:** `/Users/TU_USUARIO/Library/Application Support/Claude/claude_desktop_config.json`
* **Contenido a pegar:**
  ```json
  {
    "mcpServers": {
      "gestiones-electricas": {
        "command": "node",
        "args": [
          "/Users/isaias/Downloads/obsidian/proyectos/ge-plataforma/mcp/src/index.js"
        ],
        "env": {
          "GE_API_URL": "http://localhost:3001"
        }
      }
    }
  }
  ```
  *(Nota: Si tu compañero se conecta desde su propia máquina, en `GE_API_URL` debe colocar la IP local de tu máquina, por ejemplo: `http://192.168.40.35:3001`).*

### 🛠️ Herramientas MCP Disponibles

Una vez configurado y reiniciado Claude Desktop, la IA tendrá acceso a las siguientes herramientas automáticas:

| Nombre de la Herramienta | Parámetros de Entrada | Descripción |
| :--- | :--- | :--- |
| `list_videos` | `filter`: `"todos"\|"pendientes"\|"aprobados"\|"rechazados"` | Devuelve los videos con su estado actual de aprobación. |
| `get_video_review` | `filename` (Requerido) | Detalle de comentarios y autor de la revisión de un video. |
| `set_video_review` | `filename`, `approved`, `comment` (Opcional), `reviewer` (Opcional) | Permite a tu compañero aprobar (`approved: true`) o rechazar (`approved: false`) un video con observaciones. |
| `get_review_report` | (Ninguno) | Genera un reporte formateado en Markdown listo para copiar. |
| `list_images` | (Ninguno) | Devuelve el catálogo completo de imágenes corporativas y de campaña. |
| `list_actas` | `estado` (Opcional), `tecnico` (Opcional), `limit` (Opcional) | Muestra las últimas visitas y órdenes de trabajo registradas. |
| `get_acta` | `id` (Requerido) | Muestra la información completa de diagnóstico y acciones de una orden. |
| `create_acta` | Parámetros del acta técnica (JSON) | Permite registrar reportes o visitas desde el chat. |
| `get_stats` | (Ninguno) | Muestra un resumen ejecutivo de las métricas de la plataforma. |

### 💬 Ejemplos de uso directo con Claude

Tu compañero o tú pueden escribirle a Claude:
* *"¿Cuáles son los anuncios pendientes de revisión?"*
* *"Acepta el anuncio 03 y agrégale el comentario: Quedó excelente el paneo de las cámaras"*
* *"Dame el reporte de anuncios en markdown"*
* *"Muéstrame los datos de la última orden de trabajo registrada"*
