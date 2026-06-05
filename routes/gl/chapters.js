const express = require('express');
const path = require('path');
const { queryOne, queryAll, execute, withTransaction } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { saveBase64ToDisk, deleteFile } = require('../../lib/uploads');
const { normalizeGlImageFrame } = require('../../lib/glImageFrame');
const {
  parseChapterThemeJson,
  serializeChapterTheme,
  validateChapterThemeInput,
} = require('../../lib/glBrand');
const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');
const {
  parseBiomeSlugsFromBody,
  loadBiomesForChapterIds,
  syncChapterBiomes,
  validateBiomeSlugsExist,
} = require('../../lib/glChapterBiomes');
const {
  parseSpellCodesFromBody,
  loadSpellsForChapterIds,
  syncChapterSpells,
  validateSpellCodesExist,
} = require('../../lib/glChapterSpells');
const {
  MARKER_SELECT,
  formatMarkerRow,
  parseEventConfigInput,
  buildMarkerWriteFields,
} = require('../../lib/glMarkerRow');
const { normalizeEventConfig } = require('../../lib/glMarkerEventConfig');
const { parseAppearanceInput } = require('../../lib/glMarkerAppearance');
const {
  resolveImportRows,
  applyChapterCharteImport,
  buildChapterCharteTemplateWorkbook,
  buildChapterCharteExportWorkbook,
  loadChapterCharteExportRows,
} = require('../../lib/glChapterCharteImport');
const {
  normalizeExportScope,
  resolveChaptersImportRows,
  applyChaptersImport,
  buildChaptersTemplateWorkbook,
  buildChaptersExportWorkbook,
} = require('../../lib/glChaptersImport');

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

function attachChapterTheme(chapter) {
  if (!chapter) return chapter;
  chapter.theme = parseChapterThemeJson(chapter.theme_json);
  delete chapter.theme_json;
  return chapter;
}

function attachChapterBiomes(chapter, biomesMap) {
  if (!chapter) return chapter;
  const biomes = biomesMap.get(Number(chapter.id)) || [];
  chapter.biomes = biomes;
  return chapter;
}

function attachChapterSpells(chapter, spellsMap) {
  if (!chapter) return chapter;
  chapter.spells = spellsMap.get(Number(chapter.id)) || [];
  return chapter;
}

async function readChapterFull(slugOrId) {
  const isNumeric = typeof slugOrId === 'number' || /^\d+$/.test(String(slugOrId || ''));
  const chapter = isNumeric
    ? await queryOne(
      `SELECT c.id, c.slug, c.title, c.biome,
              c.map_image_url, c.story_markdown, c.biotope_markdown,
              c.biocenose_markdown, c.sortileges_markdown, c.map_image_frame_json, c.theme_json,
              c.order_index, c.created_at, c.updated_at
         FROM gl_chapters c
        WHERE c.id = ?
        LIMIT 1`,
      [Number(slugOrId)]
    )
    : await queryOne(
      `SELECT c.id, c.slug, c.title, c.biome,
              c.map_image_url, c.story_markdown, c.biotope_markdown,
              c.biocenose_markdown, c.sortileges_markdown, c.map_image_frame_json, c.theme_json,
              c.order_index, c.created_at, c.updated_at
         FROM gl_chapters c
        WHERE c.slug = ?
        LIMIT 1`,
      [normalizeSlug(slugOrId)]
    );
  if (!chapter) return null;
  chapter.map_image_frame = parseMapImageFrameJson(chapter.map_image_frame_json);
  delete chapter.map_image_frame_json;
  attachChapterTheme(chapter);
  const biomesMap = await loadBiomesForChapterIds({ queryAll }, [chapter.id]);
  attachChapterBiomes(chapter, biomesMap);
  const spellsMap = await loadSpellsForChapterIds({ queryAll }, [chapter.id]);
  attachChapterSpells(chapter, spellsMap);
  const markerRows = await queryAll(
    `SELECT ${MARKER_SELECT}
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [chapter.id]
  );
  const markers = markerRows.map(formatMarkerRow);
  return { chapter, markers };
}

/** GET /api/gl/chapters — liste publique des chapitres (sans markers). */
router.get('/', requireGlPermission('gl.read'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT c.id, c.slug, c.title, c.biome,
            c.map_image_url, c.map_image_frame_json, c.theme_json, c.order_index
       FROM gl_chapters c
      ORDER BY c.order_index ASC, c.id ASC`
  );
  const chapterIds = rows.map((row) => row.id);
  const biomesMap = await loadBiomesForChapterIds({ queryAll }, chapterIds);
  const spellsMap = await loadSpellsForChapterIds({ queryAll }, chapterIds);
  const items = rows.map((row) => {
    const item = {
      ...row,
      map_image_frame: parseMapImageFrameJson(row.map_image_frame_json),
    };
    delete item.map_image_frame_json;
    attachChapterTheme(item);
    attachChapterBiomes(item, biomesMap);
    attachChapterSpells(item, spellsMap);
    return item;
  });
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
  const biomeSlugs = parseBiomeSlugsFromBody(req.body);
  if (biomeSlugs != null) {
    const biomeError = await validateBiomeSlugsExist({ queryAll }, biomeSlugs);
    if (biomeError) return res.status(400).json({ error: biomeError });
  }
  const spellCodes = parseSpellCodesFromBody(req.body);
  if (spellCodes != null) {
    const spellError = await validateSpellCodesExist({ queryAll }, spellCodes);
    if (spellError) return res.status(400).json({ error: spellError });
  }
  const mapImageUrl = normalizeOptionalString(req.body?.mapImageUrl);
  const storyMarkdown = String(req.body?.storyMarkdown || '');
  const biotopeMarkdown = String(req.body?.biotopeMarkdown || '');
  const biocenoseMarkdown = String(req.body?.biocenoseMarkdown || '');
  const sortilegesMarkdown = String(req.body?.sortilegesMarkdown || '');
  const mapImageFrame = normalizeMapImageFrame(req.body?.mapImageFrame);
  if (!mapImageFrame) return res.status(400).json({ error: 'mapImageFrame invalide' });
  const orderIndex = toPositiveInt(req.body?.orderIndex, 0);
  let themeJson = null;
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'theme')) {
    const { theme, error: themeError } = validateChapterThemeInput(req.body.theme);
    if (themeError) return res.status(400).json({ error: themeError });
    themeJson = serializeChapterTheme(theme);
  }

  try {
    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown,
                                   biotope_markdown, biocenose_markdown, sortileges_markdown,
                                   map_image_frame_json, theme_json, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [slug, title, biome, mapImageUrl, storyMarkdown, biotopeMarkdown, biocenoseMarkdown, sortilegesMarkdown, JSON.stringify(mapImageFrame), themeJson, orderIndex]
      );
      const inserted = await tx.queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [slug]);
      const chapterId = Number(inserted.id);
      if (biomeSlugs != null) {
        await syncChapterBiomes(tx, chapterId, biomeSlugs);
      }
      if (spellCodes != null) {
        await syncChapterSpells(tx, chapterId, spellCodes);
      }
    });
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
  const biomeSlugs = parseBiomeSlugsFromBody(req.body);
  if (biomeSlugs != null) {
    const biomeError = await validateBiomeSlugsExist({ queryAll }, biomeSlugs);
    if (biomeError) return res.status(400).json({ error: biomeError });
  }
  const spellCodes = parseSpellCodesFromBody(req.body);
  if (spellCodes != null) {
    const spellError = await validateSpellCodesExist({ queryAll }, spellCodes);
    if (spellError) return res.status(400).json({ error: spellError });
  }
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
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'sortilegesMarkdown')) {
    updates.push('sortileges_markdown = ?');
    params.push(String(req.body.sortilegesMarkdown || ''));
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
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'theme')) {
    const { theme, error: themeError } = validateChapterThemeInput(req.body.theme);
    if (themeError) return res.status(400).json({ error: themeError });
    updates.push('theme_json = ?');
    params.push(serializeChapterTheme(theme));
  }
  if (updates.length === 0 && biomeSlugs == null && spellCodes == null) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  }

  await withTransaction(async (tx) => {
    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(id);
      await tx.execute(`UPDATE gl_chapters SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    if (biomeSlugs != null) {
      await syncChapterBiomes(tx, id, biomeSlugs);
    }
    if (spellCodes != null) {
      await syncChapterSpells(tx, id, spellCodes);
    }
  });

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
  const parsedCfg = parseEventConfigInput(req.body);
  if (parsedCfg.error) return res.status(400).json({ error: parsedCfg.error });

  let eventConfig = parsedCfg.skip ? null : parsedCfg.eventConfig;
  if (!eventConfig && (req.body?.qcmQuestionCode || req.body?.qcmCategorieSlug || eventType === 'quiz' || eventType === 'question')) {
    eventConfig = normalizeEventConfig({
      version: 1,
      question: {
        mode: req.body?.qcmQuestionCode ? 'fixed' : 'random',
        fixedQuestionCode: normalizeOptionalString(req.body?.qcmQuestionCode),
        pool: {
          biomeMode: 'chapter',
          categorieSlugs: normalizeOptionalString(req.body?.qcmCategorieSlug)
            ? [normalizeOptionalString(req.body.qcmCategorieSlug)]
            : [],
        },
      },
    });
  }

  const writeFields = buildMarkerWriteFields({
    eventType,
    description,
    orderIndex,
    eventConfig,
    legacy: {
      qcmCategorieSlug: normalizeOptionalString(req.body?.qcmCategorieSlug),
      qcmQuestionCode: normalizeOptionalString(req.body?.qcmQuestionCode),
    },
  });

  const appearanceParsed = parseAppearanceInput(req.body, writeFields.eventType ?? eventType);
  if (appearanceParsed.error) return res.status(400).json({ error: appearanceParsed.error });
  const appearanceFields = buildMarkerWriteFields({
    appearance: {
      displayMode: appearanceParsed.displayMode,
      emoji: appearanceParsed.emoji,
      iconUrl: appearanceParsed.iconUrl,
    },
  });

  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [chapterId]);
  if (!chapter) return res.status(404).json({ error: 'Chapitre introuvable' });
  await execute(
    `INSERT INTO gl_chapter_markers (
       chapter_id, x_pct, y_pct, event_type, label, description,
       qcm_categorie_slug, qcm_question_code, event_config_json,
       display_mode, emoji, icon_url, order_index, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      chapterId,
      xPct,
      yPct,
      writeFields.eventType,
      label,
      writeFields.description,
      writeFields.qcmCategorieSlug,
      writeFields.qcmQuestionCode,
      writeFields.eventConfigJson,
      appearanceFields.displayMode,
      appearanceFields.emoji,
      appearanceFields.iconUrl,
      writeFields.orderIndex,
    ]
  );
  const markerRow = await queryOne(
    `SELECT ${MARKER_SELECT}
       FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1`,
    [chapterId]
  );
  return res.status(201).json(formatMarkerRow(markerRow));
});

/** PUT /api/gl/chapters/admin/markers/:markerId — met à jour un marker. */
router.put('/admin/markers/:markerId', requireGlPermission('gl.content.manage'), async (req, res) => {
  const markerId = Number(req.params.markerId);
  if (!Number.isFinite(markerId)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne(`SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`, [markerId]);
  if (!existing) return res.status(404).json({ error: 'Marker introuvable' });

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

  const appearanceKeys = ['displayMode', 'display_mode', 'emoji', 'iconUrl', 'icon_url'];
  const hasAppearanceInput = appearanceKeys.some(
    (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key)
  );
  if (hasAppearanceInput) {
    const nextEventType = Object.prototype.hasOwnProperty.call(req.body || {}, 'eventType')
      ? normalizeOptionalString(req.body.eventType)
      : existing.event_type;
    const appearanceParsed = parseAppearanceInput(req.body, nextEventType);
    if (appearanceParsed.error) return res.status(400).json({ error: appearanceParsed.error });
    updates.push('display_mode = ?');
    params.push(appearanceParsed.displayMode);
    updates.push('emoji = ?');
    params.push(appearanceParsed.emoji);
    updates.push('icon_url = ?');
    params.push(appearanceParsed.iconUrl);
  }

  const parsedCfg = parseEventConfigInput(req.body);
  if (parsedCfg.error) return res.status(400).json({ error: parsedCfg.error });
  if (!parsedCfg.skip) {
    const writeFields = buildMarkerWriteFields({
      eventConfig: parsedCfg.eventConfig,
      legacy: {
        qcmCategorieSlug: Object.prototype.hasOwnProperty.call(req.body || {}, 'qcmCategorieSlug')
          ? normalizeOptionalString(req.body.qcmCategorieSlug)
          : existing.qcm_categorie_slug,
        qcmQuestionCode: Object.prototype.hasOwnProperty.call(req.body || {}, 'qcmQuestionCode')
          ? normalizeOptionalString(req.body.qcmQuestionCode)
          : existing.qcm_question_code,
      },
    });
    updates.push('event_config_json = ?');
    params.push(writeFields.eventConfigJson);
    updates.push('qcm_categorie_slug = ?');
    params.push(writeFields.qcmCategorieSlug);
    updates.push('qcm_question_code = ?');
    params.push(writeFields.qcmQuestionCode);
  } else {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'qcmCategorieSlug')) {
      updates.push('qcm_categorie_slug = ?');
      params.push(normalizeOptionalString(req.body.qcmCategorieSlug));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'qcmQuestionCode')) {
      updates.push('qcm_question_code = ?');
      params.push(normalizeOptionalString(req.body.qcmQuestionCode));
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  params.push(markerId);
  await execute(`UPDATE gl_chapter_markers SET ${updates.join(', ')} WHERE id = ?`, params);
  const updated = await queryOne(`SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`, [markerId]);
  if (!updated) return res.status(404).json({ error: 'Marker introuvable' });
  return res.json(formatMarkerRow(updated));
});

/** GET /api/gl/chapters/admin/import/template — modèle XLSX série de chapitres. */
router.get('/admin/import/template', requireGlPermission('gl.content.manage'), async (req, res) => {
  const scope = normalizeExportScope(req.query?.scope);
  const buffer = buildChaptersTemplateWorkbook(scope);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-chapitres.xlsx"');
  return res.send(buffer);
});

/** GET /api/gl/chapters/admin/export — export XLSX série de chapitres. */
router.get('/admin/export', requireGlPermission('gl.content.manage'), async (req, res) => {
  const scope = normalizeExportScope(req.query?.scope);
  const slug = normalizeSlug(req.query?.slug);
  const buffer = await buildChaptersExportWorkbook(
    { queryAll },
    { scope, slug: slug || undefined }
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-export-chapitres.xlsx"');
  return res.send(buffer);
});

/** POST /api/gl/chapters/admin/import — import XLSX série de chapitres. */
router.post('/admin/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  const syncReperes = !!req.body?.syncReperes;
  const syncZones = !!req.body?.syncZones;
  let parsed;
  try {
    parsed = resolveChaptersImportRows(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Fichier import invalide' });
  }
  const hasAnyRows = (parsed.chapterRows?.length || 0)
    + (parsed.markerRows?.length || 0)
    + (parsed.zoneRows?.length || 0)
    + (parsed.charteRows?.length || 0);
  if (hasAnyRows === 0) {
    return res.status(400).json({ error: 'Fichier import vide ou sans lignes exploitables' });
  }
  try {
    const report = await withTransaction(async (tx) => applyChaptersImport(
      { queryAll: tx.queryAll, execute: tx.execute },
      parsed,
      {
        dryRun,
        syncReperes,
        syncZones,
        createdBy: req.glAuth?.userId != null ? Number(req.glAuth.userId) : null,
      }
    ));
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
});

/** GET /api/gl/chapters/admin/charte/import/template — modèle XLSX charte chapitres. */
router.get('/admin/charte/import/template', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const buffer = buildChapterCharteTemplateWorkbook();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-chapitres-charte.xlsx"');
  return res.send(buffer);
});

/** GET /api/gl/chapters/admin/charte/export — export XLSX chartes chapitres. */
router.get('/admin/charte/export', requireGlPermission('gl.content.manage'), async (req, res) => {
  const slug = normalizeSlug(req.query?.slug);
  const rows = await loadChapterCharteExportRows({ queryAll }, { slug: slug || undefined });
  const buffer = buildChapterCharteExportWorkbook(rows);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-export-chapitres-charte.xlsx"');
  return res.send(buffer);
});

/** POST /api/gl/chapters/admin/charte/import — import XLSX charte chapitres. */
router.post('/admin/charte/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  let parsed;
  try {
    parsed = resolveImportRows(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Fichier import invalide' });
  }
  const rows = parsed?.rows || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Fichier import vide ou sans lignes exploitables' });
  }
  try {
    const report = await applyChapterCharteImport({ queryAll, execute }, rows, { dryRun });
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
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
