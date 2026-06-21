'use strict';

const { asTrimmedString } = require('./shared/stringHelpers');
const { parseWorkbook, buildWorkbookBuffer } = require('./spreadsheet');
const { getGlImportMaxFileBytes, formatImportMaxFileLabel } = require('./glImportLimits');
const {
  GL_BRAND_COLOR_KEYS,
  normalizeChapterTheme,
  validateChapterThemeInput,
  parseChapterThemeJson,
  serializeChapterTheme,
} = require('./glBrand');
const { normalizeGlImageFrame } = require('./glImageFrame');

const MAX_IMPORT_FILE_BYTES = getGlImportMaxFileBytes('default');
const MAX_IMPORT_ROWS = 200;
const CHARTE_SHEET = 'chapitres_charte';

const COLOR_RESET_VALUES = new Set(['-', 'reset', 'réinitialiser', 'reinitialiser']);

const CHARTE_TEMPLATE_HEADERS = [
  'slug',
  'titre',
  'image_carte_url',
  'couleur_primaire',
  'couleur_secondaire',
  'couleur_tertiaire',
  'couleur_texte',
  'couleur_liens',
  'couleur_liens_survol',
  'couleur_barre_haute',
  'couleur_fond',
  'cadre_ratio',
  'cadre_ajustement',
  'cadre_focal_x',
  'cadre_focal_y',
  'cadre_largeur_max',
  'cadre_hauteur_max',
];

const CHARTE_TEMPLATE_SAMPLE_ROW = [
  'exemple-chapitre',
  'Chapitre exemple',
  '/maps/map-foret.svg',
  '#1a4d2e',
  '',
  '',
  '',
  '',
  '',
  '',
  '#f0fdf4',
  '16/9',
  'contain',
  '50',
  '50',
  '',
  '',
];

const HEADER_ALIASES = new Map([
  ['slug', 'slug'],
  ['titre', 'title'],
  ['title', 'title'],
  ['image_carte_url', 'mapImageUrl'],
  ['map_image_url', 'mapImageUrl'],
  ['mapimageurl', 'mapImageUrl'],
  ['couleur_primaire', 'color_primary'],
  ['color_primary', 'color_primary'],
  ['primary', 'color_primary'],
  ['couleur_secondaire', 'color_secondary'],
  ['color_secondary', 'color_secondary'],
  ['secondary', 'color_secondary'],
  ['couleur_tertiaire', 'color_tertiary'],
  ['color_tertiary', 'color_tertiary'],
  ['tertiary', 'color_tertiary'],
  ['couleur_texte', 'color_text'],
  ['color_text', 'color_text'],
  ['text', 'color_text'],
  ['couleur_liens', 'color_link'],
  ['color_link', 'color_link'],
  ['link', 'color_link'],
  ['couleur_liens_survol', 'color_link_hover'],
  ['color_link_hover', 'color_link_hover'],
  ['linkhover', 'color_link_hover'],
  ['couleur_barre_haute', 'color_topbar'],
  ['color_topbar', 'color_topbar'],
  ['topbar', 'color_topbar'],
  ['couleur_fond', 'color_background'],
  ['color_background', 'color_background'],
  ['background', 'color_background'],
  ['cadre_ratio', 'frame_aspect_ratio'],
  ['frame_aspect_ratio', 'frame_aspect_ratio'],
  ['aspectratio', 'frame_aspect_ratio'],
  ['cadre_ajustement', 'frame_object_fit'],
  ['frame_object_fit', 'frame_object_fit'],
  ['objectfit', 'frame_object_fit'],
  ['cadre_focal_x', 'frame_focal_x'],
  ['frame_focal_x', 'frame_focal_x'],
  ['focalx', 'frame_focal_x'],
  ['cadre_focal_y', 'frame_focal_y'],
  ['frame_focal_y', 'frame_focal_y'],
  ['focaly', 'frame_focal_y'],
  ['cadre_largeur_max', 'frame_max_width_px'],
  ['frame_max_width_px', 'frame_max_width_px'],
  ['cadre_hauteur_max', 'frame_max_height_px'],
  ['frame_max_height_px', 'frame_max_height_px'],
]);

const COLOR_FIELD_TO_KEY = Object.freeze({
  color_primary: 'primary',
  color_secondary: 'secondary',
  color_tertiary: 'tertiary',
  color_text: 'text',
  color_link: 'link',
  color_link_hover: 'linkHover',
  color_topbar: 'topbar',
  color_background: 'background',
});

function normalizeSlug(value) {
  return asTrimmedString(value).toLowerCase();
}

function normalizeImportHeader(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapRowToShape(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = HEADER_ALIASES.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function isColorResetValue(value) {
  const s = asTrimmedString(value).toLowerCase();
  return COLOR_RESET_VALUES.has(s);
}

function parseColorCell(value) {
  const raw = asTrimmedString(value);
  if (!raw) return { skip: true };
  if (isColorResetValue(raw)) return { reset: true };
  return { value: raw };
}

function hasFrameInput(mapped) {
  return [
    'frame_aspect_ratio',
    'frame_object_fit',
    'frame_focal_x',
    'frame_focal_y',
    'frame_max_width_px',
    'frame_max_height_px',
  ].some((key) => asTrimmedString(mapped[key]) !== '');
}

function buildFramePartialFromMapped(mapped) {
  if (!hasFrameInput(mapped)) return { provided: false, partial: null };
  const partial = {};
  const ratio = asTrimmedString(mapped.frame_aspect_ratio);
  if (ratio) partial.aspectRatio = ratio;
  const fit = asTrimmedString(mapped.frame_object_fit);
  if (fit) partial.objectFit = fit;
  const fx = asTrimmedString(mapped.frame_focal_x);
  if (fx) partial.focalX = Number(fx);
  const fy = asTrimmedString(mapped.frame_focal_y);
  if (fy) partial.focalY = Number(fy);
  const mw = asTrimmedString(mapped.frame_max_width_px);
  if (mw) partial.maxWidthPx = Number(mw);
  const mh = asTrimmedString(mapped.frame_max_height_px);
  if (mh) partial.maxHeightPx = Number(mh);
  return { provided: true, partial };
}

function buildColorDeltasFromMapped(mapped) {
  const deltas = {};
  let hasAny = false;
  for (const [field, colorKey] of Object.entries(COLOR_FIELD_TO_KEY)) {
    if (!Object.prototype.hasOwnProperty.call(mapped, field)) continue;
    const parsed = parseColorCell(mapped[field]);
    if (parsed.skip) continue;
    hasAny = true;
    if (parsed.reset) deltas[colorKey] = null;
    else deltas[colorKey] = parsed.value;
  }
  return { hasAny, deltas };
}

function mergeThemeWithColorDeltas(existingTheme, deltas) {
  const current = normalizeChapterTheme(existingTheme);
  const nextColors = { ...current.colors };
  for (const [key, val] of Object.entries(deltas)) {
    if (val === null) {
      delete nextColors[key];
    } else {
      nextColors[key] = val;
    }
  }
  return { colors: nextColors };
}

function buildChapterChartePayload(row = {}) {
  const mapped = mapRowToShape(row);
  const slug = normalizeSlug(mapped.slug);
  const title = asTrimmedString(mapped.title);
  const mapImageUrlRaw = asTrimmedString(mapped.mapImageUrl);
  const { hasAny: hasColorDeltas, deltas: colorDeltas } = buildColorDeltasFromMapped(mapped);
  const frameInfo = buildFramePartialFromMapped(mapped);

  const payload = {
    slug,
    title: title || null,
    mapImageUrl: mapImageUrlRaw || null,
    hasColorDeltas,
    colorDeltas,
    hasMapImageUrl: mapImageUrlRaw.length > 0,
    hasFrame: frameInfo.provided,
    framePartial: frameInfo.partial,
  };
  return payload;
}

function validateChapterChartePayload(payload, rowNumber) {
  const errors = [];
  if (!payload.slug) {
    errors.push({ row: rowNumber, field: 'slug', error: 'slug requis' });
  }
  if (payload.hasColorDeltas) {
    const themeForValidation = mergeThemeWithColorDeltas({ colors: {} }, payload.colorDeltas);
    const { error: themeError } = validateChapterThemeInput(themeForValidation);
    if (themeError) {
      errors.push({ row: rowNumber, field: 'theme', error: themeError });
    }
  }
  if (payload.hasFrame) {
    const probe = normalizeGlImageFrame(
      { ...normalizeGlImageFrame(null, 'chapter-map'), ...payload.framePartial },
      'chapter-map',
    );
    if (!probe) {
      errors.push({ row: rowNumber, field: 'cadre', error: 'cadre carte invalide' });
    }
  }
  return errors;
}

function readSheetRows(wb, sheetName) {
  return wb.sheetNames.includes(sheetName) ? wb.sheets[sheetName] || [] : [];
}

async function parseChapterCharteWorkbook(buffer, options = {}) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  const maxBytes = options.maxFileBytes ?? getGlImportMaxFileBytes('default');
  if (buffer.length > maxBytes) {
    throw new Error(`Fichier import trop volumineux (max ${formatImportMaxFileLabel(maxBytes)})`);
  }
  const wb = await parseWorkbook(buffer);
  const rows = readSheetRows(wb, CHARTE_SHEET);
  return { rows };
}

async function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseChapterCharteWorkbook(buffer);
}

function buildImportReportBase(dryRun, rowsCount) {
  return {
    dryRun,
    sourceType: 'xlsx',
    totals: {
      received: rowsCount,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_invalid: 0,
    },
    preview: [],
    errors: [],
  };
}

function fixExportColorOrder(row) {
  const theme = normalizeChapterTheme(parseChapterThemeJson(row.theme_json));
  const frame = row.map_image_frame_json
    ? normalizeGlImageFrame(JSON.parse(String(row.map_image_frame_json)), 'chapter-map')
    : normalizeGlImageFrame(null, 'chapter-map');
  return [
    row.slug ?? '',
    row.title ?? '',
    row.map_image_url ?? '',
    theme.colors.primary ?? '',
    theme.colors.secondary ?? '',
    theme.colors.tertiary ?? '',
    theme.colors.text ?? '',
    theme.colors.link ?? '',
    theme.colors.linkHover ?? '',
    theme.colors.topbar ?? '',
    theme.colors.background ?? '',
    frame.aspectRatio ?? '',
    frame.objectFit ?? '',
    frame.focalX ?? '',
    frame.focalY ?? '',
    frame.maxWidthPx ?? '',
    frame.maxHeightPx ?? '',
  ];
}

async function buildChapterCharteExportWorkbook(rows) {
  const data = [CHARTE_TEMPLATE_HEADERS, ...rows.map(fixExportColorOrder)];
  return buildWorkbookBuffer([{ name: CHARTE_SHEET, aoa: data }]);
}

async function buildChapterCharteTemplateWorkbook() {
  return buildWorkbookBuffer([
    { name: CHARTE_SHEET, aoa: [CHARTE_TEMPLATE_HEADERS, CHARTE_TEMPLATE_SAMPLE_ROW] },
  ]);
}

async function loadChapterCharteExportRows(deps, options = {}) {
  const { queryAll } = deps;
  const slugFilter = normalizeSlug(options.slug);
  const rows = slugFilter
    ? await queryAll(
        `SELECT slug, title, map_image_url, map_image_frame_json, theme_json
         FROM gl_chapters
        WHERE slug = ?
        ORDER BY order_index ASC, id ASC`,
        [slugFilter],
      )
    : await queryAll(
        `SELECT slug, title, map_image_url, map_image_frame_json, theme_json
         FROM gl_chapters
        ORDER BY order_index ASC, id ASC`,
      );
  return rows;
}

async function applyChapterCharteImport(deps, rawRows, options = {}) {
  const { queryAll, execute } = deps;
  const dryRun = !!options.dryRun;
  const report = buildImportReportBase(dryRun, rawRows.length);

  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (max ${MAX_IMPORT_ROWS})`);
  }

  const existingRows = await queryAll(
    'SELECT id, slug, title, theme_json, map_image_frame_json FROM gl_chapters',
  );
  const existingBySlug = new Map(existingRows.map((r) => [String(r.slug), r]));

  const validRows = [];
  for (let i = 0; i < rawRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildChapterChartePayload(rawRows[i]);
    const rowErrors = validateChapterChartePayload(payload, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      report.totals.skipped_invalid += 1;
      continue;
    }
    const existing = existingBySlug.get(payload.slug);
    if (!existing && !payload.title) {
      report.errors.push({
        row: rowNumber,
        field: 'titre',
        error: 'Chapitre introuvable : titre requis pour créer un nouveau chapitre',
      });
      report.totals.skipped_invalid += 1;
      continue;
    }
    validRows.push({ rowNumber, payload, existing });
  }

  report.totals.valid = validRows.length;
  report.preview = validRows.slice(0, 5).map(({ payload, existing }) => ({
    slug: payload.slug,
    title: payload.title || existing?.title || payload.slug,
  }));

  if (dryRun) {
    for (const { payload, existing } of validRows) {
      if (existing) report.totals.updated += 1;
      else report.totals.created += 1;
    }
    return report;
  }

  const defaultFrame = normalizeGlImageFrame(null, 'chapter-map');

  for (const { payload, existing } of validRows) {
    if (existing) {
      const updates = [];
      const params = [];

      if (payload.hasMapImageUrl) {
        updates.push('map_image_url = ?');
        params.push(payload.mapImageUrl);
      }

      if (payload.hasFrame) {
        const currentFrame = existing.map_image_frame_json
          ? normalizeGlImageFrame(JSON.parse(String(existing.map_image_frame_json)), 'chapter-map')
          : defaultFrame;
        const merged = normalizeGlImageFrame(
          { ...currentFrame, ...payload.framePartial },
          'chapter-map',
        );
        updates.push('map_image_frame_json = ?');
        params.push(JSON.stringify(merged));
      }

      if (payload.hasColorDeltas) {
        const mergedTheme = mergeThemeWithColorDeltas(
          parseChapterThemeJson(existing.theme_json),
          payload.colorDeltas,
        );
        const { theme, error: themeError } = validateChapterThemeInput(mergedTheme);
        if (themeError) {
          report.errors.push({ row: 0, field: 'theme', error: themeError });
          report.totals.skipped_invalid += 1;
          continue;
        }
        updates.push('theme_json = ?');
        params.push(serializeChapterTheme(theme));
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        params.push(existing.id);
        await execute(`UPDATE gl_chapters SET ${updates.join(', ')} WHERE id = ?`, params);
        report.totals.updated += 1;
      }
    } else {
      let themeJson = null;
      if (payload.hasColorDeltas) {
        const mergedTheme = mergeThemeWithColorDeltas({ colors: {} }, payload.colorDeltas);
        const { theme, error: themeError } = validateChapterThemeInput(mergedTheme);
        if (themeError) throw new Error(themeError);
        themeJson = serializeChapterTheme(theme);
      }
      const mapImageFrame = payload.hasFrame
        ? normalizeGlImageFrame({ ...defaultFrame, ...payload.framePartial }, 'chapter-map')
        : defaultFrame;
      const mapImageUrl = payload.hasMapImageUrl ? payload.mapImageUrl : null;

      await execute(
        `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown,
                                   biotope_markdown, biocenose_markdown, sortileges_markdown,
                                   map_image_frame_json, theme_json, order_index, created_at, updated_at)
         VALUES (?, ?, NULL, ?, '', '', '', '', ?, ?, 0, NOW(), NOW())`,
        [payload.slug, payload.title, mapImageUrl, JSON.stringify(mapImageFrame), themeJson],
      );
      existingBySlug.set(payload.slug, { slug: payload.slug });
      report.totals.created += 1;
    }
  }

  return report;
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  CHARTE_SHEET,
  CHARTE_TEMPLATE_HEADERS,
  CHARTE_TEMPLATE_SAMPLE_ROW,
  buildChapterChartePayload,
  validateChapterChartePayload,
  parseChapterCharteWorkbook,
  resolveImportRows,
  applyChapterCharteImport,
  loadChapterCharteExportRows,
  buildChapterCharteTemplateWorkbook,
  buildChapterCharteExportWorkbook,
  mergeThemeWithColorDeltas,
};
