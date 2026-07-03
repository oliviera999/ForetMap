const express = require('express');
const path = require('path');
const { queryOne, queryAll, execute, withTransaction } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { saveBase64ToDisk, deleteFile } = require('../../lib/uploads');
const { serializeChapterTheme, validateChapterThemeInput } = require('../../lib/glBrand');
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
const {
  normalizeEventConfig,
  normalizeEventTypeAlias,
  MARKER_EVENT_TYPES,
} = require('../../lib/glMarkerEventConfig');
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
const {
  normalizeSlug,
  clampPercent,
  toPositiveInt,
  parsePlateauNumber,
  parseChapterMapVisibilityField,
  normalizeMapImageFrame,
  parseMapImageFrameJson,
  attachChapterTheme,
  attachChapterBiomes,
  attachChapterSpells,
} = require('../../lib/gl/chaptersRouteHelpers');
const { buildDynamicUpdate } = require('../../lib/gl/buildDynamicUpdate');
const { z, validate } = require('../../lib/validate');
const asyncHandler = require('../../lib/asyncHandler');

const router = express.Router();

// O-audit §4 — PUT /admin/:id : champs éditables déclaratifs (buildDynamicUpdate).
// Sémantique « présent mais null » préservée champ par champ (mêmes messages, même ordre) :
// - title : null/'' → 400 « Titre requis » ;
// - biome / mapImageUrl / souffleFace : null → NULL en base ;
// - *Markdown : null → '' (String(raw || '')) ;
// - orderIndex : null → 0 (toPositiveInt) ;
// - mapImageFrame : null → 400 « mapImageFrame invalide » ;
// - theme : null → theme_json NULL (validateChapterThemeInput accepte null) ;
// - plateauNumber : null/'' → NULL, hors [1..5] → 400 ;
// - mapMarkersVisible / mapZonesVisible : booléen ou null, sinon 400.
const CHAPTER_UPDATE_FIELDS = [
  {
    key: 'title',
    column: 'title',
    parse: (raw) => {
      const title = normalizeOptionalString(raw);
      return title ? { value: title } : { error: 'Titre requis' };
    },
  },
  { key: 'biome', column: 'biome', parse: (raw) => ({ value: normalizeOptionalString(raw) }) },
  {
    key: 'mapImageUrl',
    column: 'map_image_url',
    parse: (raw) => ({ value: normalizeOptionalString(raw) }),
  },
  {
    key: 'storyMarkdown',
    column: 'story_markdown',
    parse: (raw) => ({ value: String(raw || '') }),
  },
  {
    key: 'biotopeMarkdown',
    column: 'biotope_markdown',
    parse: (raw) => ({ value: String(raw || '') }),
  },
  {
    key: 'biocenoseMarkdown',
    column: 'biocenose_markdown',
    parse: (raw) => ({ value: String(raw || '') }),
  },
  {
    key: 'sortilegesMarkdown',
    column: 'sortileges_markdown',
    parse: (raw) => ({ value: String(raw || '') }),
  },
  {
    key: 'orderIndex',
    column: 'order_index',
    parse: (raw) => ({ value: toPositiveInt(raw, 0) }),
  },
  {
    key: 'mapImageFrame',
    column: 'map_image_frame_json',
    parse: (raw) => {
      const mapImageFrame = normalizeMapImageFrame(raw);
      if (!mapImageFrame) return { error: 'mapImageFrame invalide' };
      return { value: JSON.stringify(mapImageFrame) };
    },
  },
  {
    key: 'theme',
    column: 'theme_json',
    parse: (raw) => {
      const { theme, error: themeError } = validateChapterThemeInput(raw);
      if (themeError) return { error: themeError };
      return { value: serializeChapterTheme(theme) };
    },
  },
  {
    key: 'souffleFace',
    column: 'souffle_face',
    parse: (raw) => ({ value: normalizeOptionalString(raw) }),
  },
  {
    key: 'plateauNumber',
    column: 'plateau_number',
    parse: (raw) => {
      const plateauNumber = parsePlateauNumber(raw);
      if (raw != null && raw !== '' && plateauNumber == null) {
        return { error: 'plateauNumber doit être entre 1 et 5' };
      }
      return { value: plateauNumber };
    },
  },
  {
    key: 'mapMarkersVisible',
    column: 'map_markers_visible',
    parse: (raw) => {
      const mapMarkersVisible = parseChapterMapVisibilityField(raw);
      if (mapMarkersVisible === undefined) {
        return { error: 'mapMarkersVisible doit être booléen ou null' };
      }
      return { value: mapMarkersVisible };
    },
  },
  {
    key: 'mapZonesVisible',
    column: 'map_zones_visible',
    parse: (raw) => {
      const mapZonesVisible = parseChapterMapVisibilityField(raw);
      if (mapZonesVisible === undefined) {
        return { error: 'mapZonesVisible doit être booléen ou null' };
      }
      return { value: mapZonesVisible };
    },
  },
];

// O-audit §4 — PUT /admin/markers/:markerId : champs simples déclaratifs. Sémantique
// préservée : label/xPct/yPct invalides → 400 ; description/effetMecanique « présent mais
// null » → NULL ; sousBiomeSlug non vide validé contre le référentiel biomes (async).
// Les blocs groupés (appearance, event_config + legacy QCM) restent dans la route.
const MARKER_UPDATE_FIELDS = [
  {
    key: 'label',
    column: 'label',
    parse: (raw) => {
      const label = normalizeOptionalString(raw);
      return label ? { value: label } : { error: 'Label requis' };
    },
  },
  {
    key: 'xPct',
    column: 'x_pct',
    parse: (raw) => {
      const v = clampPercent(raw);
      return v == null ? { error: 'xPct invalide' } : { value: v };
    },
  },
  {
    key: 'yPct',
    column: 'y_pct',
    parse: (raw) => {
      const v = clampPercent(raw);
      return v == null ? { error: 'yPct invalide' } : { value: v };
    },
  },
  {
    key: 'eventType',
    column: 'event_type',
    parse: (raw) => {
      const nextType = normalizeEventTypeAlias(raw) || normalizeOptionalString(raw);
      if (nextType && !MARKER_EVENT_TYPES.has(nextType)) {
        return { error: `eventType invalide : ${nextType}` };
      }
      return { value: nextType };
    },
  },
  {
    key: 'description',
    column: 'description',
    parse: (raw) => ({ value: raw == null ? null : String(raw) }),
  },
  {
    key: 'sousBiomeSlug',
    column: 'sous_biome_slug',
    parse: async (raw) => {
      const sousBiomeSlug = normalizeOptionalString(raw);
      if (sousBiomeSlug) {
        const biomeError = await validateBiomeSlugsExist({ queryAll }, [sousBiomeSlug]);
        if (biomeError) return { error: biomeError };
      }
      return { value: sousBiomeSlug };
    },
  },
  {
    key: 'effetMecanique',
    column: 'effet_mecanique',
    parse: (raw) => ({ value: raw == null ? null : String(raw) }),
  },
  {
    key: 'orderIndex',
    column: 'order_index',
    parse: (raw) => ({ value: toPositiveInt(raw, 0) }),
  },
];

// O7 — validation déclarative des entrées (zod via lib/validate). Les schémas restent aussi
// permissifs que la validation manuelle qu'ils précèdent : les handlers conservent leur propre
// logique (Number(req.params.id), normalizeSlug, clampPercent, etc.) et leurs messages 400.
//
// :id / :markerId — reproduit exactement le gate `const x = Number(req.params.x);
// if (!Number.isFinite(x)) -> 400 'Identifiant invalide'`. `z.coerce.number()` applique la même
// coercition que `Number(...)` et `.finite()` rejette précisément ce que `!Number.isFinite(...)`
// rejette (NaN / ±Infinity). Le handler relit `Number(req.params.x)` lui-même : contrat inchangé.
const idParamSchema = z.object({ id: z.coerce.number().finite() });
const markerIdParamSchema = z.object({ markerId: z.coerce.number().finite() });

async function readChapterFull(slugOrId) {
  const isNumeric = typeof slugOrId === 'number' || /^\d+$/.test(String(slugOrId || ''));
  const chapter = isNumeric
    ? await queryOne(
        `SELECT c.id, c.slug, c.title, c.biome,
              c.map_image_url, c.story_markdown, c.biotope_markdown,
              c.biocenose_markdown, c.sortileges_markdown, c.map_image_frame_json, c.theme_json,
              c.souffle_face, c.plateau_number, c.map_markers_visible, c.map_zones_visible,
              c.order_index, c.created_at, c.updated_at
         FROM gl_chapters c
        WHERE c.id = ?
        LIMIT 1`,
        [Number(slugOrId)],
      )
    : await queryOne(
        `SELECT c.id, c.slug, c.title, c.biome,
              c.map_image_url, c.story_markdown, c.biotope_markdown,
              c.biocenose_markdown, c.sortileges_markdown, c.map_image_frame_json, c.theme_json,
              c.souffle_face, c.plateau_number, c.map_markers_visible, c.map_zones_visible,
              c.order_index, c.created_at, c.updated_at
         FROM gl_chapters c
        WHERE c.slug = ?
        LIMIT 1`,
        [normalizeSlug(slugOrId)],
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
    [chapter.id],
  );
  const markers = markerRows.map(formatMarkerRow);
  return { chapter, markers };
}

/** GET /api/gl/chapters — liste publique des chapitres (sans markers). */
router.get(
  '/',
  requireGlPermission('gl.read'),
  asyncHandler(async (_req, res) => {
    const rows = await queryAll(
      `SELECT c.id, c.slug, c.title, c.biome,
            c.map_image_url, c.map_image_frame_json, c.theme_json, c.plateau_number,
            c.map_markers_visible, c.map_zones_visible, c.order_index
       FROM gl_chapters c
      ORDER BY c.order_index ASC, c.id ASC`,
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
  }),
);

/** GET /api/gl/chapters/:slug — détail public d'un chapitre + markers. */
router.get(
  '/:slug',
  requireGlPermission('gl.read'),
  asyncHandler(async (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Slug invalide' });
    const data = await readChapterFull(slug);
    if (!data) return res.status(404).json({ error: 'Chapitre introuvable' });
    return res.json({
      chapter: data.chapter,
      markers: data.markers,
    });
  }),
);

/* ---------------------- Routes admin (gl.content.manage) ---------------------- */

/** POST /api/gl/chapters/admin — crée un chapitre. */
router.post(
  '/admin',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
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
    const plateauNumber = parsePlateauNumber(req.body?.plateauNumber);
    const mapMarkersVisible = parseChapterMapVisibilityField(req.body?.mapMarkersVisible);
    const mapZonesVisible = parseChapterMapVisibilityField(req.body?.mapZonesVisible);
    if (
      req.body &&
      Object.prototype.hasOwnProperty.call(req.body, 'mapMarkersVisible') &&
      mapMarkersVisible === undefined
    ) {
      return res.status(400).json({ error: 'mapMarkersVisible doit être booléen ou null' });
    }
    if (
      req.body &&
      Object.prototype.hasOwnProperty.call(req.body, 'mapZonesVisible') &&
      mapZonesVisible === undefined
    ) {
      return res.status(400).json({ error: 'mapZonesVisible doit être booléen ou null' });
    }
    let themeJson = null;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'theme')) {
      const { theme, error: themeError } = validateChapterThemeInput(req.body.theme);
      if (themeError) return res.status(400).json({ error: themeError });
      themeJson = serializeChapterTheme(theme);
    }

    try {
      await withTransaction(async (tx) => {
        // Audit GL §4.6 — l'id créé provient d'insertId (plus de re-SELECT par slug).
        const insertResult = await tx.execute(
          `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown,
                                   biotope_markdown, biocenose_markdown, sortileges_markdown,
                                   map_image_frame_json, theme_json, plateau_number,
                                   map_markers_visible, map_zones_visible, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            slug,
            title,
            biome,
            mapImageUrl,
            storyMarkdown,
            biotopeMarkdown,
            biocenoseMarkdown,
            sortilegesMarkdown,
            JSON.stringify(mapImageFrame),
            themeJson,
            plateauNumber,
            mapMarkersVisible ?? null,
            mapZonesVisible ?? null,
            orderIndex,
          ],
        );
        const chapterId = Number(insertResult.insertId);
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
    // Audit GL §4.6 — le contrat 201 renvoie { chapter (avec created_at/updated_at BDD,
    // biomes, sorts, thème), markers } : le re-fetch complet reste requis.
    const data = await readChapterFull(slug);
    return res.status(201).json(data);
  }),
);

/** PUT /api/gl/chapters/admin/:id — met à jour un chapitre. */
router.put(
  '/admin/:id',
  requireGlPermission('gl.content.manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
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
    const { updates, params, error } = await buildDynamicUpdate(req.body, CHAPTER_UPDATE_FIELDS);
    if (error) return res.status(400).json({ error });
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
  }),
);

/** POST /api/gl/chapters/admin/:id/map-image — upload image carte chapitre. */
router.post(
  '/admin/:id/map-image',
  requireGlPermission('gl.content.manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    const chapter = await queryOne(
      'SELECT id, slug, map_image_url FROM gl_chapters WHERE id = ? LIMIT 1',
      [id],
    );
    if (!chapter) return res.status(404).json({ error: 'Chapitre introuvable' });
    const imageData = String(req.body?.image_data || '').trim();
    if (!imageData) return res.status(400).json({ error: 'image_data requis' });

    const filename = `${chapter.slug || chapter.id}-${Date.now()}.jpg`;
    const relativePath = path.join('gl_chapters_maps', filename).replace(/\\/g, '/');
    saveBase64ToDisk(relativePath, imageData);
    const nextUrl = `/uploads/${relativePath}`;
    const oldUrl = String(chapter.map_image_url || '').trim();
    await execute('UPDATE gl_chapters SET map_image_url = ?, updated_at = NOW() WHERE id = ?', [
      nextUrl,
      id,
    ]);
    if (oldUrl.startsWith('/uploads/gl_chapters_maps/')) {
      deleteFile(oldUrl.replace('/uploads/', ''));
    }
    // Audit GL §4.6 — une seule colonne change (map_image_url) mais le contrat renvoie
    // { chapter, markers } complet, avec `updated_at` généré en BDD : construire la réponse
    // depuis les paramètres imposerait quand même biomes + sorts + markers + un SELECT
    // updated_at, soit autant de requêtes. Le re-fetch ciblé par id est donc conservé.
    const data = await readChapterFull(id);
    if (!data) return res.status(404).json({ error: 'Chapitre introuvable' });
    return res.json(data);
  }),
);

/** DELETE /api/gl/chapters/admin/:id — supprime un chapitre (refuse si lié à une partie). */
router.delete(
  '/admin/:id',
  requireGlPermission('gl.content.manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    const linked = await queryOne('SELECT 1 AS ok FROM gl_games WHERE chapter_id = ? LIMIT 1', [
      id,
    ]);
    if (linked)
      return res.status(409).json({ error: 'Chapitre lié à une partie : suppression refusée' });
    await execute('DELETE FROM gl_chapters WHERE id = ?', [id]);
    return res.json({ ok: true });
  }),
);

/** POST /api/gl/chapters/admin/:id/markers — ajoute un marker. */
router.post(
  '/admin/:id/markers',
  requireGlPermission('gl.content.manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const chapterId = Number(req.params.id);
    if (!Number.isFinite(chapterId)) return res.status(400).json({ error: 'Identifiant invalide' });
    const label = normalizeOptionalString(req.body?.label);
    if (!label) return res.status(400).json({ error: 'Label requis' });
    const xPct = clampPercent(req.body?.xPct);
    const yPct = clampPercent(req.body?.yPct);
    if (xPct == null || yPct == null)
      return res.status(400).json({ error: 'xPct et yPct requis (0..100)' });
    const eventType =
      normalizeEventTypeAlias(req.body?.eventType) || normalizeOptionalString(req.body?.eventType);
    if (eventType && !MARKER_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: `eventType invalide : ${eventType}` });
    }
    const description = req.body?.description != null ? String(req.body.description) : null;
    const sousBiomeSlug = normalizeOptionalString(req.body?.sousBiomeSlug);
    if (sousBiomeSlug) {
      const biomeError = await validateBiomeSlugsExist({ queryAll }, [sousBiomeSlug]);
      if (biomeError) return res.status(400).json({ error: biomeError });
    }
    const effetMecanique =
      req.body?.effetMecanique != null ? String(req.body.effetMecanique) : null;
    const orderIndex = toPositiveInt(req.body?.orderIndex, 0);
    const parsedCfg = parseEventConfigInput(req.body);
    if (parsedCfg.error) return res.status(400).json({ error: parsedCfg.error });

    let eventConfig = parsedCfg.skip ? null : parsedCfg.eventConfig;
    if (
      !eventConfig &&
      (req.body?.qcmQuestionCode ||
        req.body?.qcmCategorieSlug ||
        eventType === 'quiz' ||
        eventType === 'question')
    ) {
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
      sousBiomeSlug,
      effetMecanique,
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
       sous_biome_slug, effet_mecanique,
       qcm_categorie_slug, qcm_question_code, event_config_json,
       display_mode, emoji, icon_url, order_index, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        chapterId,
        xPct,
        yPct,
        writeFields.eventType,
        label,
        writeFields.description,
        writeFields.sousBiomeSlug,
        writeFields.effetMecanique,
        writeFields.qcmCategorieSlug,
        writeFields.qcmQuestionCode,
        writeFields.eventConfigJson,
        appearanceFields.displayMode,
        appearanceFields.emoji,
        appearanceFields.iconUrl,
        writeFields.orderIndex,
      ],
    );
    const markerRow = await queryOne(
      `SELECT ${MARKER_SELECT}
       FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1`,
      [chapterId],
    );
    return res.status(201).json(formatMarkerRow(markerRow));
  }),
);

/** PUT /api/gl/chapters/admin/markers/:markerId — met à jour un marker. */
router.put(
  '/admin/markers/:markerId',
  requireGlPermission('gl.content.manage'),
  validate({ params: markerIdParamSchema }),
  asyncHandler(async (req, res) => {
    const markerId = Number(req.params.markerId);
    if (!Number.isFinite(markerId)) return res.status(400).json({ error: 'Identifiant invalide' });
    const existing = await queryOne(
      `SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`,
      [markerId],
    );
    if (!existing) return res.status(404).json({ error: 'Marker introuvable' });

    const { updates, params, error } = await buildDynamicUpdate(req.body, MARKER_UPDATE_FIELDS);
    if (error) return res.status(400).json({ error });

    const appearanceKeys = ['displayMode', 'display_mode', 'emoji', 'iconUrl', 'icon_url'];
    const hasAppearanceInput = appearanceKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(req.body || {}, key),
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
    const updated = await queryOne(
      `SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`,
      [markerId],
    );
    if (!updated) return res.status(404).json({ error: 'Marker introuvable' });
    return res.json(formatMarkerRow(updated));
  }),
);

/** GET /api/gl/chapters/admin/import/template — modèle XLSX série de chapitres. */
router.get(
  '/admin/import/template',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const scope = normalizeExportScope(req.query?.scope);
    const buffer = await buildChaptersTemplateWorkbook(scope);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="foretmap-gl-modele-chapitres.xlsx"',
    );
    return res.send(buffer);
  }),
);

/** GET /api/gl/chapters/admin/export — export XLSX série de chapitres. */
router.get(
  '/admin/export',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const scope = normalizeExportScope(req.query?.scope);
    const slug = normalizeSlug(req.query?.slug);
    const buffer = await buildChaptersExportWorkbook(
      { queryAll },
      { scope, slug: slug || undefined },
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="foretmap-gl-export-chapitres.xlsx"',
    );
    return res.send(buffer);
  }),
);

/** POST /api/gl/chapters/admin/import — import XLSX série de chapitres. */
router.post(
  '/admin/import',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const dryRun = !!req.body?.dryRun;
    const syncReperes = !!req.body?.syncReperes;
    const syncZones = !!req.body?.syncZones;
    let parsed;
    try {
      parsed = await resolveChaptersImportRows(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Fichier import invalide' });
    }
    const hasAnyRows =
      (parsed.chapterRows?.length || 0) +
      (parsed.markerRows?.length || 0) +
      (parsed.zoneRows?.length || 0) +
      (parsed.charteRows?.length || 0);
    if (hasAnyRows === 0) {
      return res.status(400).json({ error: 'Fichier import vide ou sans lignes exploitables' });
    }
    try {
      const report = await withTransaction(async (tx) =>
        applyChaptersImport({ queryAll: tx.queryAll, execute: tx.execute }, parsed, {
          dryRun,
          syncReperes,
          syncZones,
          createdBy: req.glAuth?.userId != null ? Number(req.glAuth.userId) : null,
        }),
      );
      return res.json({ report });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Import impossible' });
    }
  }),
);

/** GET /api/gl/chapters/admin/charte/import/template — modèle XLSX charte chapitres. */
router.get(
  '/admin/charte/import/template',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    const buffer = await buildChapterCharteTemplateWorkbook();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="foretmap-gl-modele-chapitres-charte.xlsx"',
    );
    return res.send(buffer);
  }),
);

/** GET /api/gl/chapters/admin/charte/export — export XLSX chartes chapitres. */
router.get(
  '/admin/charte/export',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const slug = normalizeSlug(req.query?.slug);
    const rows = await loadChapterCharteExportRows({ queryAll }, { slug: slug || undefined });
    const buffer = await buildChapterCharteExportWorkbook(rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="foretmap-gl-export-chapitres-charte.xlsx"',
    );
    return res.send(buffer);
  }),
);

/** POST /api/gl/chapters/admin/charte/import — import XLSX charte chapitres. */
router.post(
  '/admin/charte/import',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const dryRun = !!req.body?.dryRun;
    let parsed;
    try {
      parsed = await resolveImportRows(req.body || {});
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
  }),
);

/** DELETE /api/gl/chapters/admin/markers/:markerId — supprime un marker. */
router.delete(
  '/admin/markers/:markerId',
  requireGlPermission('gl.content.manage'),
  validate({ params: markerIdParamSchema }),
  asyncHandler(async (req, res) => {
    const markerId = Number(req.params.markerId);
    if (!Number.isFinite(markerId)) return res.status(400).json({ error: 'Identifiant invalide' });
    // ON DELETE SET NULL côté gl_teams.position_marker_id => les équipes restent en jeu sans marker.
    await withTransaction(async (tx) => {
      await tx.execute(
        'UPDATE gl_teams SET position_marker_id = NULL, updated_at = NOW() WHERE position_marker_id = ?',
        [markerId],
      );
      await tx.execute('DELETE FROM gl_chapter_markers WHERE id = ?', [markerId]);
    });
    return res.json({ ok: true });
  }),
);

module.exports = router;
// Exportés pour test no-DB du contrat O7 (équivalence avec le gate Number()/Number.isFinite).
module.exports.idParamSchema = idParamSchema;
module.exports.markerIdParamSchema = markerIdParamSchema;
// Exportées pour tests de contrat §4 (sémantique champ par champ des PUT).
module.exports.CHAPTER_UPDATE_FIELDS = CHAPTER_UPDATE_FIELDS;
module.exports.MARKER_UPDATE_FIELDS = MARKER_UPDATE_FIELDS;
