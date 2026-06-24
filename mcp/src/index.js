#!/usr/bin/env node
// ============================================================
//  Gestiones Eléctricas — MCP Server
//  Servidor MCP para integración con Claude Desktop
//
//  Herramientas expuestas:
//    list_videos        → Lista videos con estado de revisión
//    get_video_review   → Revisión de un video específico
//    set_video_review   → Aprobar/rechazar un video
//    get_review_report  → Reporte completo de revisiones
//    list_images        → Lista imágenes por categoría
//    list_actas         → Lista actas técnicas
//    get_acta           → Detalles de un acta
//    create_acta        → Registrar nueva acta
//    get_stats          → Estadísticas generales de la plataforma
// ============================================================
'use strict';

const { Server }       = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const API_URL = process.env.GE_API_URL || 'http://localhost:3001';

// ─── Helper: llamar a la API ──────────────────────────────
async function api(method, endpoint, body = null) {
  const fetch = (await import('node-fetch')).default;
  const opts  = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${endpoint}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// ─── Definición de herramientas ───────────────────────────
const TOOLS = [
  {
    name: 'list_videos',
    description: 'Lista todos los videos disponibles de Gestiones Eléctricas con su estado de revisión (aprobado / rechazado / pendiente).',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['todos', 'pendientes', 'aprobados', 'rechazados'],
          description: 'Filtrar por estado. Por defecto: todos.',
          default: 'todos'
        }
      }
    }
  },
  {
    name: 'get_video_review',
    description: 'Obtiene la revisión detallada de un video específico.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Nombre del archivo de video (ej: "01.mp4", "ok 09.mp4")' }
      },
      required: ['filename']
    }
  },
  {
    name: 'set_video_review',
    description: 'Aprueba o rechaza un video. Puedes agregar un comentario de corrección.',
    inputSchema: {
      type: 'object',
      properties: {
        filename:  { type: 'string', description: 'Nombre del archivo de video' },
        approved:  { type: 'boolean', description: 'true para aprobar, false para rechazar' },
        comment:   { type: 'string', description: 'Comentario o corrección (opcional)' },
        reviewer:  { type: 'string', description: 'Nombre del revisor (opcional, por defecto "compañero")' }
      },
      required: ['filename', 'approved']
    }
  },
  {
    name: 'get_review_report',
    description: 'Genera el reporte completo de revisiones de todos los videos en formato Markdown.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_images',
    description: 'Lista todas las imágenes disponibles agrupadas por categoría (CIG = catálogo corporativo, IMG = campaña predictivo).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_actas',
    description: 'Lista las actas técnicas registradas. Puedes filtrar por estado o técnico.',
    inputSchema: {
      type: 'object',
      properties: {
        estado:  { type: 'string', enum: ['borrador', 'firmado', 'enviado'], description: 'Filtrar por estado' },
        tecnico: { type: 'string', description: 'Filtrar por nombre de técnico' },
        limit:   { type: 'number', description: 'Máximo de resultados (defecto: 20)', default: 20 }
      }
    }
  },
  {
    name: 'get_acta',
    description: 'Obtiene los detalles completos de un acta técnica por su ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID del acta (UUID)' }
      },
      required: ['id']
    }
  },
  {
    name: 'create_acta',
    description: 'Registra una nueva acta técnica de visita.',
    inputSchema: {
      type: 'object',
      properties: {
        ot_number:    { type: 'string', description: 'Número de orden de trabajo' },
        fecha:        { type: 'string', description: 'Fecha de la visita (YYYY-MM-DD)' },
        tipo_visita:  { type: 'string', description: 'Tipo: diagnostico, mantenimiento, instalacion, cotizacion, emergencia' },
        cliente:      { type: 'string', description: 'Nombre del cliente' },
        contacto:     { type: 'string', description: 'Persona de contacto' },
        telefono:     { type: 'string', description: 'Teléfono de contacto' },
        direccion:    { type: 'string', description: 'Dirección del servicio' },
        ciudad:       { type: 'string', description: 'Ciudad' },
        tecnico:      { type: 'string', description: 'Nombre del técnico' },
        diagnostico:  { type: 'string', description: 'Diagnóstico técnico' },
        acciones:     { type: 'string', description: 'Acciones realizadas' },
        observaciones:{ type: 'string', description: 'Observaciones adicionales' }
      },
      required: ['ot_number', 'fecha', 'tipo_visita', 'cliente', 'direccion', 'tecnico', 'diagnostico', 'acciones']
    }
  },
  {
    name: 'get_stats',
    description: 'Estadísticas generales de la plataforma: cuántos videos, imágenes, actas, aprobaciones pendientes, calificación promedio.',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ─── Handlers de herramientas ─────────────────────────────
async function handleTool(name, args) {
  switch (name) {

    case 'list_videos': {
      const data = await api('GET', '/api/assets/videos');
      let videos = data.videos;

      if (args.filter === 'pendientes') videos = videos.filter(v => v.review.approved === null);
      if (args.filter === 'aprobados')  videos = videos.filter(v => v.review.approved === true);
      if (args.filter === 'rechazados') videos = videos.filter(v => v.review.approved === false);

      const lines = videos.map(v => {
        const st = v.review.approved === null ? '⏳' : v.review.approved ? '✅' : '❌';
        const cm = v.review.comment ? ` — "${v.review.comment}"` : '';
        return `${st} \`${v.filename}\`${cm}`;
      });

      return [
        `📹 **Videos disponibles** (${data.aprobados}✅ ${data.rechazados}❌ ${data.pendientes}⏳)`,
        '',
        ...lines
      ].join('\n');
    }

    case 'get_video_review': {
      try {
        const r = await api('GET', `/api/reviews/${encodeURIComponent(args.filename)}`);
        const st = r.approved === null ? '⏳ Pendiente' : r.approved ? '✅ Aprobado' : '❌ Rechazado';
        return `**${args.filename}**\nEstado: ${st}\nComentario: ${r.comment || '(ninguno)'}\nRevisor: ${r.reviewer}\nÚltima actualización: ${r.updated_at}`;
      } catch (e) {
        if (e.message.includes('Sin revisión')) return `⏳ \`${args.filename}\` aún no tiene revisión registrada.`;
        throw e;
      }
    }

    case 'set_video_review': {
      const body = { approved: args.approved, comment: args.comment || '', reviewer: args.reviewer || 'compañero' };
      const res  = await api('POST', `/api/reviews/${encodeURIComponent(args.filename)}`, body);
      const st   = args.approved ? '✅ Aprobado' : '❌ Rechazado';
      return `${st} \`${args.filename}\`${args.comment ? `\nComentario guardado: "${args.comment}"` : ''}`;
    }

    case 'get_review_report': {
      const fetch = (await import('node-fetch')).default;
      const res   = await fetch(`${API_URL}/api/reviews/report?format=markdown`);
      return await res.text();
    }

    case 'list_images': {
      const data = await api('GET', '/api/assets/images');
      const lines = Object.entries(data.images).map(([prefix, imgs]) => {
        const label = prefix === 'CIG' ? 'Catálogo Corporativo' : prefix === 'IMG' ? 'Campaña Predictivo' : prefix;
        return [`**${label}** (${imgs.length} imágenes):`, ...imgs.map(i => `  • ${i.name}`)].join('\n');
      });
      return `🖼️ **Imágenes disponibles** — ${data.total} en total\n\n${lines.join('\n\n')}`;
    }

    case 'list_actas': {
      const params = new URLSearchParams();
      if (args.estado)  params.set('estado', args.estado);
      if (args.tecnico) params.set('tecnico', args.tecnico);
      if (args.limit)   params.set('limit', args.limit);

      const data  = await api('GET', `/api/actas?${params}`);
      if (data.actas.length === 0) return 'No se encontraron actas con los filtros especificados.';

      const lines = data.actas.map(a =>
        `• **${a.ot_number}** | ${a.fecha} | ${a.cliente} | Técnico: ${a.tecnico} | Estado: ${a.estado} | ID: \`${a.id}\``
      );
      return `📋 **Actas técnicas** (${data.total} total, mostrando ${data.returned})\n\n${lines.join('\n')}`;
    }

    case 'get_acta': {
      const a = await api('GET', `/api/actas/${args.id}`);
      return [
        `📄 **Acta ${a.ot_number}** — ${a.estado.toUpperCase()}`,
        `Fecha: ${a.fecha} | Tipo: ${a.tipo_visita}`,
        `Cliente: ${a.cliente} (${a.contacto || '-'}) — ${a.telefono || '-'}`,
        `Dirección: ${a.direccion}, ${a.ciudad}`,
        `Técnico: ${a.tecnico} | Matrícula: ${a.matricula || '-'}`,
        ``,
        `**Diagnóstico:** ${a.diagnostico}`,
        `**Acciones:** ${a.acciones}`,
        a.observaciones ? `**Observaciones:** ${a.observaciones}` : '',
        a.calificacion ? `⭐ Calificación del cliente: ${a.calificacion}/5` : '',
        `Registrada: ${a.created_at}`
      ].filter(Boolean).join('\n');
    }

    case 'create_acta': {
      const res = await api('POST', '/api/actas', args);
      return `✅ Acta registrada exitosamente\nID: \`${res.acta.id}\`\nOT: ${res.acta.ot_number} | Cliente: ${res.acta.cliente}`;
    }

    case 'get_stats': {
      const s = await api('GET', '/api/assets/stats');
      return [
        `📊 **Estadísticas — Gestiones Eléctricas**`,
        ``,
        `**Assets:**`,
        `  • Videos: ${s.assets.videos} | Imágenes: ${s.assets.images}`,
        ``,
        `**Revisiones de videos:**`,
        `  • ✅ Aprobados: ${s.reviews.aprobados}`,
        `  • ❌ Rechazados: ${s.reviews.rechazados}`,
        `  • ⏳ Pendientes: ${s.reviews.pendientes}`,
        ``,
        `**Actas técnicas:**`,
        `  • Total: ${s.actas.total}`,
        s.actas.borrador  ? `  • Borrador: ${s.actas.borrador}` : '',
        s.actas.firmado   ? `  • Firmadas: ${s.actas.firmado}` : '',
        s.actas.enviado   ? `  • Enviadas: ${s.actas.enviado}` : '',
        s.actas.calificacion_promedio
          ? `  • ⭐ Calificación promedio: ${s.actas.calificacion_promedio}/5`
          : '  • ⭐ Sin calificaciones aún',
      ].filter(l => l !== '').join('\n');
    }

    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

// ─── Servidor MCP ─────────────────────────────────────────
async function main() {
  const server = new Server(
    { name: 'gestiones-electricas', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const result = await handleTool(name, args);
      return { content: [{ type: 'text', text: String(result) }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error: ${err.message}` }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('⚡ GE MCP Server activo — esperando conexión de Claude...');
}

main().catch(err => {
  console.error('Error fatal en MCP server:', err);
  process.exit(1);
});
