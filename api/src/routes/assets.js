// ============================================================
//  Route: /api/assets
//  Listado de videos e imágenes disponibles
// ============================================================
'use strict';

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { getDB } = require('../db/database');

// Rutas absolutas a los directorios de assets
const VIDEOS_DIR = process.env.GE_VIDEOS_DIR ||
  path.join(__dirname, '../../../../Gestiones Eléctricas/publicidad ');

const IMAGES_DIR = process.env.GE_IMAGES_DIR ||
  path.join(__dirname, '../../../../Gestiones Eléctricas/entregables_finales/imagenes');

// GET /api/assets/videos
// → Lista todos los videos con su estado de revisión
router.get('/videos', (req, res) => {
  const db = getDB();

  let files = [];
  try {
    files = fs.readdirSync(VIDEOS_DIR)
      .filter(f => f.toLowerCase().endsWith('.mp4'))
      .sort();
  } catch (err) {
    return res.status(500).json({ error: `No se puede leer directorio de videos: ${err.message}` });
  }

  // Enriquecer con datos de revisión desde DB
  const reviews = db.prepare(`SELECT filename, approved, comment, reviewer, updated_at FROM reviews`).all();
  const reviewMap = Object.fromEntries(reviews.map(r => [r.filename, r]));

  const videos = files.map(filename => {
    const stat = fs.statSync(path.join(VIDEOS_DIR, filename));
    const rev  = reviewMap[filename];
    return {
      filename,
      size_mb:   (stat.size / 1024 / 1024).toFixed(1),
      modified:  stat.mtime.toISOString(),
      review: rev
        ? { approved: rev.approved === null ? null : Boolean(rev.approved), comment: rev.comment, reviewer: rev.reviewer, updated_at: rev.updated_at }
        : { approved: null, comment: '', reviewer: null, updated_at: null }
    };
  });

  const total     = videos.length;
  const aprobados = videos.filter(v => v.review.approved === true).length;
  const rechazados = videos.filter(v => v.review.approved === false).length;

  res.json({ total, aprobados, rechazados, pendientes: total - aprobados - rechazados, videos });
});

// GET /api/assets/images
// → Lista todas las imágenes, agrupadas por prefijo (CIG / IMG)
router.get('/images', (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(IMAGES_DIR)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort();
  } catch (err) {
    return res.status(500).json({ error: `No se puede leer directorio de imágenes: ${err.message}` });
  }

  const grouped = {};
  files.forEach(filename => {
    const prefix = filename.match(/^([A-Z]+)\d+/)?.[1] || 'OTROS';
    if (!grouped[prefix]) grouped[prefix] = [];
    const stat = fs.statSync(path.join(IMAGES_DIR, filename));
    grouped[prefix].push({
      filename,
      name: filename.replace(/\.(png|jpg|jpeg|webp)$/i, '').replace(/_/g, ' '),
      size_kb: Math.round(stat.size / 1024),
      modified: stat.mtime.toISOString()
    });
  });

  res.json({
    total: files.length,
    groups: Object.keys(grouped).length,
    images: grouped
  });
});

// GET /api/assets/stats
// → Resumen general de assets + revisiones
router.get('/stats', (req, res) => {
  const db = getDB();

  let videoCount = 0, imageCount = 0;
  try { videoCount = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.mp4')).length; } catch (_) {}
  try { imageCount = fs.readdirSync(IMAGES_DIR).filter(f => /\.(png|jpg)$/i.test(f)).length; } catch (_) {}

  const reviewStats  = db.prepare(`SELECT approved, COUNT(*) as c FROM reviews GROUP BY approved`).all();
  const actasStats   = db.prepare(`SELECT estado, COUNT(*) as c FROM actas GROUP BY estado`).all();
  const totalActas   = db.prepare(`SELECT COUNT(*) as c FROM actas`).get().c;
  const avgCalif     = db.prepare(`SELECT AVG(calificacion) as avg FROM actas WHERE calificacion IS NOT NULL`).get();

  res.json({
    assets: { videos: videoCount, images: imageCount },
    reviews: {
      pendientes: videoCount - (reviewStats.find(r => r.approved !== null)?.c || 0),
      aprobados:  reviewStats.find(r => r.approved === 1)?.c || 0,
      rechazados: reviewStats.find(r => r.approved === 0)?.c || 0
    },
    actas: {
      total: totalActas,
      calificacion_promedio: avgCalif.avg ? parseFloat(avgCalif.avg.toFixed(1)) : null,
      ...Object.fromEntries(actasStats.map(s => [s.estado, s.c]))
    }
  });
});

module.exports = router;
