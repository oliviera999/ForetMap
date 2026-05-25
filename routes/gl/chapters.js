const express = require('express');
const path = require('path');
const { queryOne, queryAll, execute, withTransaction } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { saveBase64ToDisk, deleteFile } = require('../../lib/uploads');
const { normalizeGlImageFrame } = require('../../lib/glImageFrame');
const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');

const router = express.Router();

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function normalizeMapImageFrame(value) {
  if (value == null) return normalizeGlImageFrame(null, 'chapter-map');
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return normalizeGlImageFrame(value, 'chapter-map');
}

function parseMapImageFrameJson(value) {
  if (!value) return normalizeGlImageFrame(null, 'chapter-map');
  try {
    return normalizeGlImageFrame(JSON.parse(String(value)), 'chapter-map');
  } catch (_) {
    return normalizeGlImageFrame(null, 'chapter-map');
  }
}

async function readChapterFull(slugOrId) {
  const isNumeric = typeof slugOrId === 'number' || /^\d+$/.test(String(slugOrId || ''));
  const chapter = isNumeric
    ? await queryOne(
      `SELECT id, slug, title, biome, map_image_url, story_markdown, biotope_markdown,
              biocenose_markdown, map_image_frame_json, order_index, created_at, updated_at
         FROM gl_chapters
        WHERE id = ?
        LIMIT 1`,
      [Number(slugOrId)]
    )
    : await queryOne(
      `SELECT id, slug, title, biome, map_image_url, story_markdown, biotope_markdown,
              biocenose_markdown, map_image_frame_json, order_index, created_at, updated_at
         FROM gl_chapters
        WHERE slug = ?
        LIMIT 1`,
      [normalizeSlug(slugOrId)]
    );
  if (!chapter) return null;
  chapter.map_image_frame = parseMapImageFrameJson(chapter.map_image_frame_json);
  delete chapter.map_image_frame_json;
  const markers = await queryAll(
    `SELECT id, chapter_id, x_pct, y_pct, event_type, label, description, order_index
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [chapter.id]
  );
  return { chapter, markers };
}

/** GET /api/gl/chapters — liste publique des chapitres (sans markers). */
router.get('/', requireGlPermission('gl.read'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT id, slug, title, biome, map_image_url, map_image_frame_json, order_index
       FROM gl_chapters
      ORDER BY order_index ASC, id ASC`
  );
  const items = rows.map((row) => ({
    ...row,
    map_image_frame: parseMapImageFrameJson(row.map_image_frame_json),
  }));
  for (const row of items) delete row.map_image_frame_json;
  return res.json(items);
});

/** GET /api/gl/chapters/:slug — détail public d'un chapitre + markers. */
router.get('/:slug', requireGlPermission('gl.read'), async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Slug invalide' });
  const data = await readChapterFull(slug);
  if (!data) return res.status(404).json({ error: 'Chapitre introuvable' });
  return res.json({
    chapter: data.chapter,
    markers: data.markers,
  });
});

/* ---------------------- Routes admin (gl.content.manage) ---------------------- */

/** POST /api/gl/chapters/admin — crée un chapitre. */
router.post('/admin', requireGlPermission('gl.content.manage'), async (req, res) => {
  const slug = normalizeSlug(req.body?.slug);
  const title = normalizeOptionalString(req.body?.title);
  if (!slug || !title) return res.status(400).json({ error: 'slug et title requis' });
  const biome = normalizeOptionalString(req.body?.biome);
  const mapImageUrl = normalizeOptionalString(req.body?.mapImageUrl);
  const storyMarkdown = String(req.body?.storyMarkdown || '');
  const biotopeMarkdown = String(req.body?.biotopeMarkdown || '');
  const biocenoseMarkdown = String(req.body?.biocenoseMarkdown || '');
  const mapImageFrame = normalizeMapImageFrame(req.body?.mapImageFrame);
  if (!mapImageFrame) return res.status(400).json({ error: 'mapImageFrame invalide' });
  const orderIndex = toPositiveInt(req.body?.orderIndex, 0);

  try {
    await execute(
      `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown,
                                 biotope_markdown, biocenose_markdown, map_image_frame_json, order_index,
                                 created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [slug, title, biome, mapImageUrl, storyMarkdown, biotopeMarkdown, biocenoseMarkdown, JSON.stringify(mapImageFrame), orderIndex]
    );
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Slug déjà utilisé' });
    }
    throw err;
  }
  const data = await readChapterFull(slug);
  return res.status(201).json(data);
});

/** PUT /api/gl/chapters/admin/:id — met à jour un chapitre. */
router.put('/admin/:id', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const updates = [];
  const params = [];
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    const title = normalizeOptionalString(req.body.title);
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    updates.push('title = ?');
    params.push(title);
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'biome')) {
    updates.push('biome = ?');
    params.push(normalizeOptionalString(req.body.biome));
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'mapImageUrl')) {
    updates.push('map_image_url = ?');
    params.push(normalizeOptionalString(req.body.mapImageUrl));
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'storyMarkdown')) {
    updates.push('story_markdown = ?');
    params.push(String(req.body.storyMarkdown || ''));
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'biotopeMarkdown')) {
    updates.push('biotope_markdown = ?');
    params.push(String(req.body.biotopeMarkdown || ''));
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'biocenoseMarkdown')) {
    updates.push('biocenose_markdown = ?');
    params.push(String(req.body.biocenoseMarkdown || ''));
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'orderIndex')) {
    updates.push('order_index = ?');
    params.push(toPositiveInt(req.body.orderIndex, 0));
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'mapImageFrame')) {
    const mapImageFrame = normalizeMapImageFrame(req.body.mapImageFrame);
    if (!mapImageFrame) return res.status(400).json({ error: 'mapImageFrame invalide' });
    updates.push('map_image_frame_json = ?');
    params.push(JSON.stringify(mapImageFrame));
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  updates.push('updated_at = NOW()');
  params.push(id);
  await execute(`UPDATE gl_chapters SET ${updates.join(', ')} WHERE id = ?`, params);
  const data = await readChapterFull(id);
  if (!data) return res.status(404).json({ error: 'Chapitre introuvable' });
  return res.json(data);
});

/** POST /api/gl/chapters/admin/:id/map-image — upload image carte chapitre. */
router.post('/admin/:id/map-image', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const chapter = await queryOne(
    'SELECT id, slug, map_image_url FROM gl_chapters WHERE id = ? LIMIT 1',
    [id]
  );
  if (!chapter) return res.status(404).json({ error: 'Chapitre introuvable' });
  const imageData = String(req.body?.image_data || '').trim();
  if (!imageData) return res.status(400).json({ error: 'image_data requis' });

  const filename = `${chapter.slug || chapter.id}-${Date.now()}.jpg`;
  const relativePath = path.join('gl_chapters_maps', filename).replace(/\\/g, '/');
  saveBase64ToDisk(relativePath, imageData);
  const nextUrl = `/uploads/${relativePath}`;
  const oldUrl = String(chapter.map_image_url || '').trim();
  await execute('UPDATE gl_chapters SET map_image_url = ?, updated_at = NOW() WHERE id = ?', [nextUrl, id]);
  if (oldUrl.startsWith('/uploads/gl_chapters_maps/')) {
    deleteFile(oldUrl.replace('/uploads/', ''));
  }
  const data = await readChapterFull(id);
  if (!data) return res.status(404).json({ error: 'Chapitre introuvable' });
  return res.json(data);
});

/** DELETE /api/gl/chapters/admin/:id — supprime un chapitre (refuse si lié à une partie). */
router.delete('/admin/:id', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const linked = await queryOne(
    'SELECT 1 AS ok FROM gl_games WHERE chapter_id = ? LIMIT 1',
    [id]
  );
  if (linked) return res.status(409).json({ error: 'Chapitre lié à une partie : suppression refusée' });
  await execute('DELETE FROM gl_chapters WHERE id = ?', [id]);
  return res.json({ ok: true });
});

/** POST /api/gl/chapters/admin/:id/markers — ajoute un marker. */
router.post('/admin/:id/markers', requireGlPermission('gl.content.manage'), async (req, res) => {
  const chapterId = Number(req.params.id);
  if (!Number.isFinite(chapterId)) return res.status(400).json({ error: 'Identifiant invalide' });
  const label = normalizeOptionalString(req.body?.label);
  if (!label) return res.status(400).json({ error: 'Label requis' });
  const xPct = clampPercent(req.body?.xPct);
  const yPct = clampPercent(req.body?.yPct);
  if (xPct == null || yPct == null) return res.status(400).json({ error: 'xPct et yPct requis (0..100)' });
  const eventType = normalizeOptionalString(req.body?.eventType);
  const description = req.body?.description != null ? String(req.body.description) : null;
  const orderIndex = toPositiveInt(req.body?.orderIndex, 0);
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [chapterId]);
  if (!chapter) return res.status(404).json({ error: 'Chapitre introuvable' });
  await execute(
    `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, order_index, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [chapterId, xPct, yPct, eventType, label, description, orderIndex]
  );
  const marker = await queryOne(
    'SELECT id, chapter_id, x_pct, y_pct, event_type, label, description, order_index FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapterId]
  );
  return res.status(201).json(marker);
});

/** PUT /api/gl/chapters/admin/markers/:markerId — met à jour un marker. */
router.put('/admin/markers/:markerId', requireGlPermission('gl.content.manage'), async (req, res) => {
  const markerId = Number(req.params.markerId);
  if (!Number.isFinite(markerId)) return res.status(400).json({ error: 'Identifiant invalide' });
  const updates = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'label')) {
    const label = normalizeOptionalString(req.body.label);
    if (!label) return res.status(400).json({ error: 'Label requis' });
    updates.push('label = ?');
    params.push(label);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'xPct')) {
    const v = clampPercent(req.body.xPct);
    if (v == null) return res.status(400).json({ error: 'xPct invalide' });
    updates.push('x_pct = ?');
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'yPct')) {
    const v = clampPercent(req.body.yPct);
    if (v == null) return res.status(400).json({ error: 'yPct invalide' });
    updates.push('y_pct = ?');
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'eventType')) {
    updates.push('event_type = ?');
    params.push(normalizeOptionalString(req.body.eventType));
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'description')) {
    updates.push('description = ?');
    params.push(req.body.description == null ? null : String(req.body.description));
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'orderIndex')) {
    updates.push('order_index = ?');
    params.push(toPositiveInt(req.body.orderIndex, 0));
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  params.push(markerId);
  await execute(`UPDATE gl_chapter_markers SET ${updates.join(', ')} WHERE id = ?`, params);
  const updated = await queryOne(
    'SELECT id, chapter_id, x_pct, y_pct, event_type, label, description, order_index FROM gl_chapter_markers WHERE id = ? LIMIT 1',
    [markerId]
  );
  if (!updated) return res.status(404).json({ error: 'Marker introuvable' });
  return res.json(updated);
});

/** DELETE /api/gl/chapters/admin/markers/:markerId — supprime un marker. */
router.delete('/admin/markers/:markerId', requireGlPermission('gl.content.manage'), async (req, res) => {
  const markerId = Number(req.params.markerId);
  if (!Number.isFinite(markerId)) return res.status(400).json({ error: 'Identifiant invalide' });
  // ON DELETE SET NULL côté gl_teams.position_marker_id => les équipes restent en jeu sans marker.
  await withTransaction(async (tx) => {
    await tx.execute('UPDATE gl_teams SET position_marker_id = NULL, updated_at = NOW() WHERE position_marker_id = ?', [markerId]);
    await tx.execute('DELETE FROM gl_chapter_markers WHERE id = ?', [markerId]);
  });
  return res.json({ ok: true });
});

module.exports = router;
