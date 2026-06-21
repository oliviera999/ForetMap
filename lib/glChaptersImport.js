'use strict';

const { asTrimmedString } = require('./shared/stringHelpers');
const { parseWorkbook, buildWorkbookBuffer } = require('./spreadsheet');
const { getGlImportMaxFileBytes, formatImportMaxFileLabel } = require('./glImportLimits');
const {
  CHARTE_SHEET,
  CHARTE_TEMPLATE_HEADERS,
  CHARTE_TEMPLATE_SAMPLE_ROW,
  applyChapterCharteImport,
  loadChapterCharteExportRows,
} = require('./glChapterCharteImport');
const {
  normalizeBiomeSlugList,
  syncChapterBiomes,
  validateBiomeSlugsExist,
  loadBiomesForChapterIds,
} = require('./glChapterBiomes');
const {
  normalizeSpellCodeList,
  syncChapterSpells,
  validateSpellCodesExist,
  loadSpellsForChapterIds,
} = require('./glChapterSpells');
const { normalizeLoreBiomeSlug } = require('./glBiomesRegistry');
const {
  MARKER_EVENT_TYPES,
  normalizeEventConfig,
  serializeEventConfig,
  eventConfigToLegacyMirror,
  normalizeEventTypeAlias,
  mergeEventConfigWithImport,
  resolveMarkerEventConfig,
} = require('./shared/glMarkerEventConfigCore');

const MAX_IMPORT_FILE_BYTES = getGlImportMaxFileBytes('default');
const MAX_CHAPTER_ROWS = 200;
const MAX_MARKER_ROWS = 2000;
const MAX_ZONE_ROWS = 500;

const CHAPTERS_SHEET = 'chapitres';
const MARKERS_SHEET = 'reperes';
const ZONES_SHEET = 'zones_royaume';

const EXPORT_SCOPES = new Set(['content', 'content_markers', 'full']);

const CHAPTERS_TEMPLATE_HEADERS = [
  'slug',
  'titre',
  'ordre',
  'biome',
  'biomes_slugs',
  'sorts_codes',
  'image_carte_url',
  'histoire_markdown',
  'biotope_markdown',
  'biocenose_markdown',
  'sortileges_markdown',
  'souffle_face',
  'plateau_number',
];

const CHAPTERS_TEMPLATE_SAMPLE_ROW = [
  'exemple-chapitre',
  'Chapitre exemple — La forêt magique',
  '10',
  'forêt tempérée',
  'foret_temperee',
  '',
  '/maps/map-foret.svg',
  'Les équipes découvrent la forêt magique.',
  'Forêt tempérée riche en micro-habitats.',
  'Plantes, insectes et oiseaux liés au biome.',
  '## Grimoire du chapitre',
  "Le Souffle s'annonce",
];

const MARKERS_TEMPLATE_HEADERS = [
  'chapitre_slug',
  'id',
  'label',
  'x_pct',
  'y_pct',
  'type_evenement',
  'description',
  'ordre',
  'qcm_categorie_slug',
  'qcm_question_code',
  'mode_affichage',
  'emoji',
  'icon_url',
  'event_config_json',
  'sous_biome_slug',
  'effet_mecanique',
  'effet_gnome',
  'dpv_gnome',
  'dgem_gnome',
  'dmvt_gnome',
  'effet_licorne',
  'dpv_licorne',
  'dgem_licorne',
  'dmvt_licorne',
  'delta_pv',
  'delta_gemmes',
  'delta_mouvement',
  'categorie_question',
  'niveau_question',
  'tonalite',
  'rarete',
];

const MARKERS_TEMPLATE_SAMPLE_ROWS = [
  [
    'exemple-chapitre',
    '',
    'Départ',
    '20',
    '25',
    'start',
    'La classe démarre son aventure.',
    '10',
    '',
    '',
    'label',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'exemple-chapitre',
    '',
    'Quiz forêt',
    '55',
    '40',
    'quiz',
    '',
    '20',
    'faune_foret',
    '',
    'emoji',
    '❓',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'exemple-chapitre',
    '',
    'Souffle étrange',
    '70',
    '55',
    'souffle',
    'Une chaleur anormale monte.',
    '30',
    '',
    '',
    'emoji',
    '🌬️',
    '',
    '',
    'jungle_afc',
    'Moiteur → recule de 1 case',
    "Gnome : la moiteur t'épuise → recule de 1 case.",
    '0',
    '0',
    '-1',
    'Licorne : signe illisible → passe ton tour.',
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
    '',
    '',
    '',
    '',
  ],
];

const ZONES_TEMPLATE_HEADERS = [
  'chapitre_slug',
  'id',
  'label',
  'description',
  'couleur',
  'points_json',
  'musique_url',
  'musique_volume',
];

const ZONES_TEMPLATE_SAMPLE_ROW = [
  'exemple-chapitre',
  '',
  'Clairière',
  'Zone de départ',
  '#22c55e',
  '[{"x":10,"y":10},{"x":40,"y":10},{"x":40,"y":40},{"x":10,"y":40}]',
  '',
  '0.7',
];

const CHAPTER_HEADER_ALIASES = new Map([
  ['slug', 'slug'],
  ['titre', 'title'],
  ['title', 'title'],
  ['ordre', 'order_index'],
  ['order_index', 'order_index'],
  ['biome', 'biome'],
  ['biomes_slugs', 'biomes_slugs'],
  ['biome_slugs', 'biomes_slugs'],
  ['sorts_codes', 'spell_codes'],
  ['spell_codes', 'spell_codes'],
  ['image_carte_url', 'map_image_url'],
  ['map_image_url', 'map_image_url'],
  ['histoire_markdown', 'story_markdown'],
  ['story_markdown', 'story_markdown'],
  ['biotope_markdown', 'biotope_markdown'],
  ['biocenose_markdown', 'biocenose_markdown'],
  ['sortileges_markdown', 'sortileges_markdown'],
  ['souffle_face', 'souffle_face'],
  ['plateau', 'plateau_number'],
  ['plateau_number', 'plateau_number'],
]);

const MARKER_HEADER_ALIASES = new Map([
  ['chapitre_slug', 'chapter_slug'],
  ['chapter_slug', 'chapter_slug'],
  ['id', 'id'],
  ['label', 'label'],
  ['x_pct', 'x_pct'],
  ['xpct', 'x_pct'],
  ['y_pct', 'y_pct'],
  ['ypct', 'y_pct'],
  ['type_evenement', 'event_type'],
  ['event_type', 'event_type'],
  ['description', 'description'],
  ['ordre', 'order_index'],
  ['order_index', 'order_index'],
  ['qcm_categorie_slug', 'qcm_categorie_slug'],
  ['qcm_question_code', 'qcm_question_code'],
  ['mode_affichage', 'display_mode'],
  ['display_mode', 'display_mode'],
  ['emoji', 'emoji'],
  ['icon_url', 'icon_url'],
  ['event_config_json', 'event_config_json'],
  ['sous_biome_slug', 'sous_biome_slug'],
  ['effet_mecanique', 'effet_mecanique'],
  ['effet_gnome', 'effet_gnome'],
  ['dpv_gnome', 'dpv_gnome'],
  ['dgem_gnome', 'dgem_gnome'],
  ['dmvt_gnome', 'dmvt_gnome'],
  ['effet_licorne', 'effet_licorne'],
  ['dpv_licorne', 'dpv_licorne'],
  ['dgem_licorne', 'dgem_licorne'],
  ['dmvt_licorne', 'dmvt_licorne'],
  ['delta_pv', 'delta_pv'],
  ['delta_gemmes', 'delta_gemmes'],
  ['delta_mouvement', 'delta_mouvement'],
  ['categorie_question', 'categorie_question'],
  ['niveau_question', 'niveau_question'],
  ['tonalite', 'tonalite'],
  ['rarete', 'rarete'],
]);

const ZONE_HEADER_ALIASES = new Map([
  ['chapitre_slug', 'chapter_slug'],
  ['chapter_slug', 'chapter_slug'],
  ['id', 'id'],
  ['label', 'label'],
  ['description', 'description'],
  ['couleur', 'color'],
  ['color', 'color'],
  ['points_json', 'points_json'],
  ['musique_url', 'music_url'],
  ['music_url', 'music_url'],
  ['musique_volume', 'music_volume'],
  ['music_volume', 'music_volume'],
]);

const DISPLAY_MODES = new Set(['label', 'emoji', 'icon']);

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

function mapRowWithAliases(row, aliasMap) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = aliasMap.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function parseCsvList(value) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeExportScope(scope) {
  const s = asTrimmedString(scope).toLowerCase();
  return EXPORT_SCOPES.has(s) ? s : 'content';
}

function readSheetRows(wb, sheetName) {
  return wb.sheetNames.includes(sheetName) ? wb.sheets[sheetName] || [] : [];
}

function buildImportReportBase(dryRun, received) {
  return {
    dryRun,
    sourceType: 'xlsx',
    totals: {
      received,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_invalid: 0,
      markers_synced: 0,
      markers_deleted: 0,
      zones_synced: 0,
      zones_deleted: 0,
      charte_updated: 0,
    },
    preview: [],
    errors: [],
  };
}

function buildChapterPayload(row = {}) {
  const mapped = mapRowWithAliases(row, CHAPTER_HEADER_ALIASES);
  const slug = normalizeSlug(mapped.slug);
  const title = asTrimmedString(mapped.title);
  const biome = asTrimmedString(mapped.biome);
  const orderRaw = asTrimmedString(mapped.order_index);
  const mapImageUrl = asTrimmedString(mapped.map_image_url);
  const storyMarkdown = asTrimmedString(mapped.story_markdown);
  const biotopeMarkdown = asTrimmedString(mapped.biotope_markdown);
  const biocenoseMarkdown = asTrimmedString(mapped.biocenose_markdown);
  const sortilegesMarkdown = asTrimmedString(mapped.sortileges_markdown);
  const souffleFace = asTrimmedString(mapped.souffle_face);
  const plateauRaw = asTrimmedString(mapped.plateau_number);
  const biomesSlugsRaw = asTrimmedString(mapped.biomes_slugs);
  const spellCodesRaw = asTrimmedString(mapped.spell_codes);

  return {
    slug,
    title: title || null,
    hasTitle: title.length > 0,
    hasBiome: biome.length > 0,
    biome: biome || null,
    hasOrderIndex: orderRaw.length > 0,
    orderIndex: orderRaw.length > 0 ? Math.max(0, Math.floor(Number(orderRaw) || 0)) : 0,
    hasMapImageUrl: mapImageUrl.length > 0,
    mapImageUrl: mapImageUrl || null,
    hasStoryMarkdown: storyMarkdown.length > 0,
    storyMarkdown,
    hasBiotopeMarkdown: biotopeMarkdown.length > 0,
    biotopeMarkdown,
    hasBiocenoseMarkdown: biocenoseMarkdown.length > 0,
    biocenoseMarkdown,
    hasSortilegesMarkdown: sortilegesMarkdown.length > 0,
    sortilegesMarkdown,
    hasSouffleFace: souffleFace.length > 0,
    souffleFace: souffleFace || null,
    hasPlateauNumber: plateauRaw.length > 0,
    plateauNumber:
      plateauRaw.length > 0 ? Math.max(1, Math.min(5, Math.floor(Number(plateauRaw) || 0))) : null,
    hasBiomeSlugs: biomesSlugsRaw.length > 0,
    biomeSlugs: normalizeBiomeSlugList(parseCsvList(biomesSlugsRaw)),
    hasSpellCodes: spellCodesRaw.length > 0,
    spellCodes: normalizeSpellCodeList(parseCsvList(spellCodesRaw)),
  };
}

function validateChapterPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.slug) {
    errors.push({ row: rowNumber, field: 'slug', error: 'slug requis' });
  }
  return errors;
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function buildMarkerPayload(row = {}) {
  const mapped = mapRowWithAliases(row, MARKER_HEADER_ALIASES);
  const chapterSlug = normalizeSlug(mapped.chapter_slug);
  const idRaw = asTrimmedString(mapped.id);
  const label = asTrimmedString(mapped.label);
  const xPct = clampPercent(mapped.x_pct);
  const yPct = clampPercent(mapped.y_pct);
  const eventTypeRaw = asTrimmedString(mapped.event_type).toLowerCase() || null;
  const eventType = eventTypeRaw ? normalizeEventTypeAlias(eventTypeRaw) || eventTypeRaw : null;
  const description = asTrimmedString(mapped.description);
  const orderRaw = asTrimmedString(mapped.order_index);
  const qcmCategorieSlug = asTrimmedString(mapped.qcm_categorie_slug) || null;
  const qcmQuestionCode = asTrimmedString(mapped.qcm_question_code) || null;
  const sousBiomeSlug = normalizeLoreBiomeSlug(mapped.sous_biome_slug) || null;
  const effetMecanique = asTrimmedString(mapped.effet_mecanique) || null;
  const displayModeRaw = asTrimmedString(mapped.display_mode).toLowerCase();
  const displayMode = DISPLAY_MODES.has(displayModeRaw) ? displayModeRaw : null;
  const emoji = asTrimmedString(mapped.emoji) || null;
  const iconUrl = asTrimmedString(mapped.icon_url) || null;
  const eventConfigRaw = asTrimmedString(mapped.event_config_json);

  let eventConfig = null;
  if (eventConfigRaw) {
    eventConfig = normalizeEventConfig(eventConfigRaw);
  }
  const mergedConfig = mergeEventConfigWithImport(eventConfig, {
    effet_gnome: mapped.effet_gnome,
    dpv_gnome: mapped.dpv_gnome,
    dgem_gnome: mapped.dgem_gnome,
    dmvt_gnome: mapped.dmvt_gnome,
    effet_licorne: mapped.effet_licorne,
    dpv_licorne: mapped.dpv_licorne,
    dgem_licorne: mapped.dgem_licorne,
    dmvt_licorne: mapped.dmvt_licorne,
    delta_pv: mapped.delta_pv,
    delta_gemmes: mapped.delta_gemmes,
    delta_mouvement: mapped.delta_mouvement,
    categorie_question: mapped.categorie_question,
    niveau_question: mapped.niveau_question,
    qcm_categorie_slug: qcmCategorieSlug,
    qcm_question_code: qcmQuestionCode,
    tonalite: mapped.tonalite,
    rarete: mapped.rarete,
  });
  if (mergedConfig) eventConfig = mergedConfig;

  return {
    chapterSlug,
    markerId: idRaw ? Number(idRaw) : null,
    label,
    xPct,
    yPct,
    eventType,
    description: description || null,
    orderIndex: orderRaw.length > 0 ? Math.max(0, Math.floor(Number(orderRaw) || 0)) : 0,
    qcmCategorieSlug,
    qcmQuestionCode,
    sousBiomeSlug,
    effetMecanique,
    displayMode,
    emoji,
    iconUrl,
    eventConfig,
    hasEventConfig: eventConfigRaw.length > 0,
  };
}

function validateMarkerPayload(payload, rowNumber, knownChapterSlugs) {
  const errors = [];
  if (!payload.chapterSlug) {
    errors.push({ row: rowNumber, field: 'chapitre_slug', error: 'chapitre_slug requis' });
  } else if (!knownChapterSlugs.has(payload.chapterSlug)) {
    errors.push({
      row: rowNumber,
      field: 'chapitre_slug',
      error: `chapitre introuvable : ${payload.chapterSlug}`,
    });
  }
  if (!payload.label) {
    errors.push({ row: rowNumber, field: 'label', error: 'label requis' });
  }
  if (payload.xPct == null) {
    errors.push({ row: rowNumber, field: 'x_pct', error: 'x_pct invalide (0-100)' });
  }
  if (payload.yPct == null) {
    errors.push({ row: rowNumber, field: 'y_pct', error: 'y_pct invalide (0-100)' });
  }
  if (payload.eventType && !MARKER_EVENT_TYPES.has(payload.eventType)) {
    errors.push({
      row: rowNumber,
      field: 'type_evenement',
      error: `type_evenement invalide : ${payload.eventType}`,
    });
  }
  if (payload.hasEventConfig && !payload.eventConfig) {
    errors.push({
      row: rowNumber,
      field: 'event_config_json',
      error: 'event_config_json invalide',
    });
  }
  if (payload.markerId != null && (!Number.isFinite(payload.markerId) || payload.markerId <= 0)) {
    errors.push({ row: rowNumber, field: 'id', error: 'id repère invalide' });
  }
  return errors;
}

function validateZonePoints(points) {
  if (!Array.isArray(points)) return false;
  if (points.length < 3 || points.length > 200) return false;
  for (const p of points) {
    if (!p || typeof p !== 'object') return false;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 0 || x > 100 || y < 0 || y > 100) return false;
  }
  return true;
}

function buildZonePayload(row = {}) {
  const mapped = mapRowWithAliases(row, ZONE_HEADER_ALIASES);
  const chapterSlug = normalizeSlug(mapped.chapter_slug);
  const idRaw = asTrimmedString(mapped.id);
  const label = asTrimmedString(mapped.label);
  const description = asTrimmedString(mapped.description) || null;
  const color = asTrimmedString(mapped.color) || '#22c55e';
  const pointsRaw = asTrimmedString(mapped.points_json);
  const musicUrl = asTrimmedString(mapped.music_url) || null;
  const musicVolumeRaw = asTrimmedString(mapped.music_volume);

  let points = null;
  if (pointsRaw) {
    try {
      points = JSON.parse(pointsRaw);
    } catch (_) {
      points = null;
    }
  }

  let musicVolume = 0.7;
  if (musicVolumeRaw) {
    const n = Number(musicVolumeRaw);
    if (Number.isFinite(n)) musicVolume = Math.max(0, Math.min(1, n));
  }

  return {
    chapterSlug,
    zoneId: idRaw ? Number(idRaw) : null,
    label,
    description,
    color,
    points,
    hasPoints: pointsRaw.length > 0,
    musicUrl,
    musicUrls: musicUrl ? [musicUrl] : [],
    hasMusicUrl: musicUrl != null,
    musicVolume,
    hasMusicVolume: musicVolumeRaw.length > 0,
  };
}

function validateZonePayload(payload, rowNumber, knownChapterSlugs) {
  const errors = [];
  if (!payload.chapterSlug) {
    errors.push({ row: rowNumber, field: 'chapitre_slug', error: 'chapitre_slug requis' });
  } else if (!knownChapterSlugs.has(payload.chapterSlug)) {
    errors.push({
      row: rowNumber,
      field: 'chapitre_slug',
      error: `chapitre introuvable : ${payload.chapterSlug}`,
    });
  }
  if (!payload.label) {
    errors.push({ row: rowNumber, field: 'label', error: 'label requis' });
  }
  if (!payload.hasPoints || !validateZonePoints(payload.points)) {
    errors.push({
      row: rowNumber,
      field: 'points_json',
      error: 'points_json invalide (3-200 points {x,y} en %)',
    });
  }
  if (payload.zoneId != null && (!Number.isFinite(payload.zoneId) || payload.zoneId <= 0)) {
    errors.push({ row: rowNumber, field: 'id', error: 'id zone invalide' });
  }
  return errors;
}

async function parseChaptersWorkbook(buffer, options = {}) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  const maxBytes = options.maxFileBytes ?? getGlImportMaxFileBytes('default');
  if (buffer.length > maxBytes) {
    throw new Error(`Fichier import trop volumineux (max ${formatImportMaxFileLabel(maxBytes)})`);
  }
  const wb = await parseWorkbook(buffer);
  return {
    chapterRows: readSheetRows(wb, CHAPTERS_SHEET),
    markerRows: readSheetRows(wb, MARKERS_SHEET),
    zoneRows: readSheetRows(wb, ZONES_SHEET),
    charteRows: readSheetRows(wb, CHARTE_SHEET),
    hasMarkersSheet: wb.sheetNames.includes(MARKERS_SHEET),
    hasZonesSheet: wb.sheetNames.includes(ZONES_SHEET),
    hasCharteSheet: wb.sheetNames.includes(CHARTE_SHEET),
  };
}

async function resolveChaptersImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseChaptersWorkbook(buffer);
}

function chapterRowToExport(chapter, biomes, spells) {
  return [
    chapter.slug ?? '',
    chapter.title ?? '',
    Number(chapter.order_index || 0),
    chapter.biome ?? '',
    (biomes || []).map((b) => b.slug).join(', '),
    (spells || []).map((s) => s.spell_code).join(', '),
    chapter.map_image_url ?? '',
    chapter.story_markdown ?? '',
    chapter.biotope_markdown ?? '',
    chapter.biocenose_markdown ?? '',
    chapter.sortileges_markdown ?? '',
    chapter.souffle_face ?? '',
    chapter.plateau_number ?? '',
  ];
}

function markerRowToExport(marker, chapterSlug) {
  const eventConfig = resolveMarkerEventConfig(marker);
  const eventConfigJson = eventConfig ? serializeEventConfig(eventConfig) : '';
  const neutral = eventConfig?.effects?.neutral || {};
  const gnome = eventConfig?.effects?.gnome || {};
  const unicorn = eventConfig?.effects?.unicorn || {};
  const questionPool = eventConfig?.question?.pool || {};
  return [
    chapterSlug,
    marker.id ?? '',
    marker.label ?? '',
    Number(marker.x_pct ?? 0),
    Number(marker.y_pct ?? 0),
    marker.event_type ?? '',
    marker.description ?? '',
    Number(marker.order_index || 0),
    marker.qcm_categorie_slug ?? (questionPool.categorieSlugs?.[0] || ''),
    marker.qcm_question_code ?? '',
    marker.display_mode ?? '',
    marker.emoji ?? '',
    marker.icon_url ?? '',
    eventConfigJson,
    marker.sous_biome_slug ?? '',
    marker.effet_mecanique ?? '',
    gnome.label ?? '',
    gnome.deltaPv ?? '',
    gnome.deltaGems ?? '',
    gnome.deltaMove ?? '',
    unicorn.label ?? '',
    unicorn.deltaPv ?? '',
    unicorn.deltaGems ?? '',
    unicorn.deltaMove ?? '',
    neutral.deltaPv ?? '',
    neutral.deltaGems ?? '',
    neutral.deltaMove ?? '',
    questionPool.categorieSlugs?.[0] ?? '',
    questionPool.niveaux?.[0] ?? '',
    eventConfig?.eventMeta?.tonalite ?? '',
    eventConfig?.eventMeta?.rarete ?? '',
  ];
}

function zoneRowToExport(zone, chapterSlug) {
  let pointsJson = '';
  try {
    pointsJson = zone.points_json ? String(zone.points_json) : JSON.stringify(zone.points || []);
  } catch (_) {
    pointsJson = '[]';
  }
  return [
    chapterSlug,
    zone.id ?? '',
    zone.label ?? '',
    zone.description ?? '',
    zone.color ?? '#22c55e',
    pointsJson,
    zone.music_url ?? '',
    zone.music_volume != null ? Number(zone.music_volume) : '',
  ];
}

async function loadChaptersExportData(deps, options = {}) {
  const { queryAll } = deps;
  const scope = normalizeExportScope(options.scope);
  const slugFilter = normalizeSlug(options.slug);

  const chapterRows = slugFilter
    ? await queryAll(
        `SELECT id, slug, title, biome, map_image_url, story_markdown, biotope_markdown,
              biocenose_markdown, sortileges_markdown, souffle_face, plateau_number, order_index
         FROM gl_chapters
        WHERE slug = ?
        ORDER BY order_index ASC, id ASC`,
        [slugFilter],
      )
    : await queryAll(
        `SELECT id, slug, title, biome, map_image_url, story_markdown, biotope_markdown,
              biocenose_markdown, sortileges_markdown, souffle_face, plateau_number, order_index
         FROM gl_chapters
        ORDER BY order_index ASC, id ASC`,
      );

  const chapterIds = chapterRows.map((r) => r.id);
  const biomesMap = await loadBiomesForChapterIds({ queryAll }, chapterIds);
  const spellsMap = await loadSpellsForChapterIds({ queryAll }, chapterIds);

  const slugById = new Map(chapterRows.map((r) => [Number(r.id), String(r.slug)]));

  let markerExportRows = [];
  if (scope !== 'content' && chapterIds.length > 0) {
    const placeholders = chapterIds.map(() => '?').join(', ');
    const markerRows = await queryAll(
      `SELECT id, chapter_id, x_pct, y_pct, event_type, label, description,
              sous_biome_slug, effet_mecanique,
              qcm_categorie_slug, qcm_question_code, event_config_json,
              display_mode, emoji, icon_url, order_index
         FROM gl_chapter_markers
        WHERE chapter_id IN (${placeholders})
        ORDER BY chapter_id ASC, order_index ASC, id ASC`,
      chapterIds,
    );
    markerExportRows = markerRows.map((m) => ({
      row: markerRowToExport(m, slugById.get(Number(m.chapter_id)) || ''),
      chapterId: Number(m.chapter_id),
    }));
  }

  let zoneExportRows = [];
  if (scope === 'full' && chapterIds.length > 0) {
    const placeholders = chapterIds.map(() => '?').join(', ');
    const zoneRows = await queryAll(
      `SELECT id, chapter_id, label, description, points_json, color, music_url, music_urls_json, music_volume
         FROM gl_kingdom_zones
        WHERE chapter_id IN (${placeholders})
        ORDER BY chapter_id ASC, id ASC`,
      chapterIds,
    );
    zoneExportRows = zoneRows.map((z) => ({
      row: zoneRowToExport(z, slugById.get(Number(z.chapter_id)) || ''),
      chapterId: Number(z.chapter_id),
    }));
  }

  let charteRows = [];
  if (scope === 'full') {
    charteRows = await loadChapterCharteExportRows(deps, { slug: slugFilter || undefined });
  }

  return {
    scope,
    chapters: chapterRows.map((chapter) => ({
      row: chapterRowToExport(
        chapter,
        biomesMap.get(Number(chapter.id)) || [],
        spellsMap.get(Number(chapter.id)) || [],
      ),
    })),
    markers: markerExportRows,
    zones: zoneExportRows,
    charteRows,
  };
}

async function buildChaptersWorkbookFromData(data, scope) {
  const sheets = [
    { name: CHAPTERS_SHEET, aoa: [CHAPTERS_TEMPLATE_HEADERS, ...data.chapters.map((c) => c.row)] },
  ];

  if (scope === 'content_markers' || scope === 'full') {
    sheets.push({
      name: MARKERS_SHEET,
      aoa: [MARKERS_TEMPLATE_HEADERS, ...data.markers.map((m) => m.row)],
    });
  }

  if (scope === 'full') {
    sheets.push({
      name: ZONES_SHEET,
      aoa: [ZONES_TEMPLATE_HEADERS, ...data.zones.map((z) => z.row)],
    });
    const charteAoA = [CHARTE_TEMPLATE_HEADERS];
    const { parseChapterThemeJson, normalizeChapterTheme } = require('./glBrand');
    const { normalizeGlImageFrame } = require('./glImageFrame');
    for (const row of data.charteRows) {
      const theme = normalizeChapterTheme(parseChapterThemeJson(row.theme_json));
      const frame = row.map_image_frame_json
        ? normalizeGlImageFrame(JSON.parse(String(row.map_image_frame_json)), 'chapter-map')
        : normalizeGlImageFrame(null, 'chapter-map');
      charteAoA.push([
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
      ]);
    }
    sheets.push({ name: CHARTE_SHEET, aoa: charteAoA });
  }

  return buildWorkbookBuffer(sheets);
}

async function buildChaptersTemplateWorkbook(scopeInput) {
  const scope = normalizeExportScope(scopeInput);
  const sheets = [
    { name: CHAPTERS_SHEET, aoa: [CHAPTERS_TEMPLATE_HEADERS, CHAPTERS_TEMPLATE_SAMPLE_ROW] },
  ];

  if (scope === 'content_markers' || scope === 'full') {
    sheets.push({
      name: MARKERS_SHEET,
      aoa: [MARKERS_TEMPLATE_HEADERS, ...MARKERS_TEMPLATE_SAMPLE_ROWS],
    });
  }

  if (scope === 'full') {
    sheets.push({ name: ZONES_SHEET, aoa: [ZONES_TEMPLATE_HEADERS, ZONES_TEMPLATE_SAMPLE_ROW] });
    sheets.push({ name: CHARTE_SHEET, aoa: [CHARTE_TEMPLATE_HEADERS, CHARTE_TEMPLATE_SAMPLE_ROW] });
  }

  return buildWorkbookBuffer(sheets);
}

async function buildChaptersExportWorkbook(deps, options = {}) {
  const data = await loadChaptersExportData(deps, options);
  return buildChaptersWorkbookFromData(data, data.scope);
}

function resolveMarkerWriteValues(payload) {
  const eventConfig = payload.eventConfig;
  const mirror = eventConfig
    ? eventConfigToLegacyMirror(eventConfig)
    : {
        qcmCategorieSlug: payload.qcmCategorieSlug,
        qcmQuestionCode: payload.qcmQuestionCode,
      };
  return {
    eventType: payload.eventType,
    description: payload.description,
    orderIndex: payload.orderIndex,
    eventConfigJson: eventConfig ? serializeEventConfig(eventConfig) : null,
    qcmCategorieSlug: mirror.qcmCategorieSlug,
    qcmQuestionCode: mirror.qcmQuestionCode,
    displayMode: payload.displayMode,
    emoji: payload.emoji,
    iconUrl: payload.iconUrl,
    sousBiomeSlug: payload.sousBiomeSlug,
    effetMecanique: payload.effetMecanique,
  };
}

async function applyMarkersImport(deps, validMarkers, options, report, chapterIdBySlug) {
  const { execute, queryAll } = deps;
  const dryRun = !!options.dryRun;
  const syncReperes = !!options.syncReperes;

  const byChapter = new Map();
  for (const item of validMarkers) {
    const slug = item.payload.chapterSlug;
    if (!byChapter.has(slug)) byChapter.set(slug, []);
    byChapter.get(slug).push(item);
  }

  for (const [chapterSlug, items] of byChapter.entries()) {
    const chapterId = chapterIdBySlug.get(chapterSlug);
    if (!chapterId) continue;

    const existingMarkers = await queryAll(
      `SELECT id, label FROM gl_chapter_markers WHERE chapter_id = ?`,
      [chapterId],
    );
    const byId = new Map(existingMarkers.map((m) => [Number(m.id), m]));
    const byLabel = new Map(existingMarkers.map((m) => [String(m.label), m]));

    const keptIds = new Set();

    for (const { payload } of items) {
      let targetId = null;
      if (payload.markerId && byId.has(payload.markerId)) {
        targetId = payload.markerId;
      } else if (byLabel.has(payload.label)) {
        targetId = Number(byLabel.get(payload.label).id);
      }

      const write = resolveMarkerWriteValues(payload);

      if (targetId) {
        keptIds.add(targetId);
        if (!dryRun) {
          await execute(
            `UPDATE gl_chapter_markers
                SET x_pct = ?, y_pct = ?, event_type = ?, label = ?, description = ?,
                    sous_biome_slug = ?, effet_mecanique = ?,
                    qcm_categorie_slug = ?, qcm_question_code = ?, event_config_json = ?,
                    display_mode = ?, emoji = ?, icon_url = ?, order_index = ?
              WHERE id = ? AND chapter_id = ?`,
            [
              payload.xPct,
              payload.yPct,
              write.eventType,
              payload.label,
              write.description,
              write.sousBiomeSlug,
              write.effetMecanique,
              write.qcmCategorieSlug,
              write.qcmQuestionCode,
              write.eventConfigJson,
              write.displayMode,
              write.emoji,
              write.iconUrl,
              write.orderIndex,
              targetId,
              chapterId,
            ],
          );
        }
        report.totals.markers_synced += 1;
      } else if (!dryRun) {
        const result = await execute(
          `INSERT INTO gl_chapter_markers (
             chapter_id, x_pct, y_pct, event_type, label, description,
             sous_biome_slug, effet_mecanique,
             qcm_categorie_slug, qcm_question_code, event_config_json,
             display_mode, emoji, icon_url, order_index, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            chapterId,
            payload.xPct,
            payload.yPct,
            write.eventType,
            payload.label,
            write.description,
            write.sousBiomeSlug,
            write.effetMecanique,
            write.qcmCategorieSlug,
            write.qcmQuestionCode,
            write.eventConfigJson,
            write.displayMode,
            write.emoji,
            write.iconUrl,
            write.orderIndex,
          ],
        );
        keptIds.add(Number(result.insertId));
        report.totals.markers_synced += 1;
      } else {
        report.totals.markers_synced += 1;
      }
    }

    if (syncReperes) {
      const toDelete = existingMarkers.map((m) => Number(m.id)).filter((id) => !keptIds.has(id));
      if (toDelete.length > 0) {
        report.totals.markers_deleted += toDelete.length;
        if (!dryRun) {
          const placeholders = toDelete.map(() => '?').join(', ');
          await execute(
            `UPDATE gl_teams SET position_marker_id = NULL, updated_at = NOW()
              WHERE position_marker_id IN (${placeholders})`,
            toDelete,
          );
          await execute(
            `DELETE FROM gl_chapter_markers WHERE chapter_id = ? AND id IN (${placeholders})`,
            [chapterId, ...toDelete],
          );
        }
      }
    }
  }
}

async function applyZonesImport(deps, validZones, options, report, chapterIdBySlug) {
  const { execute, queryAll } = deps;
  const dryRun = !!options.dryRun;
  const syncZones = !!options.syncZones;
  const createdBy = options.createdBy ?? null;

  const byChapter = new Map();
  for (const item of validZones) {
    const slug = item.payload.chapterSlug;
    if (!byChapter.has(slug)) byChapter.set(slug, []);
    byChapter.get(slug).push(item);
  }

  for (const [chapterSlug, items] of byChapter.entries()) {
    const chapterId = chapterIdBySlug.get(chapterSlug);
    if (!chapterId) continue;

    const existingZones = await queryAll(
      `SELECT id, label FROM gl_kingdom_zones WHERE chapter_id = ?`,
      [chapterId],
    );
    const byId = new Map(existingZones.map((z) => [Number(z.id), z]));
    const byLabel = new Map(existingZones.map((z) => [String(z.label), z]));
    const keptIds = new Set();

    for (const { payload } of items) {
      let targetId = null;
      if (payload.zoneId && byId.has(payload.zoneId)) {
        targetId = payload.zoneId;
      } else if (byLabel.has(payload.label)) {
        targetId = Number(byLabel.get(payload.label).id);
      }

      if (targetId) {
        keptIds.add(targetId);
        if (!dryRun) {
          const musicUrlsJson = payload.musicUrls?.length
            ? JSON.stringify(payload.musicUrls)
            : null;
          await execute(
            `UPDATE gl_kingdom_zones
                SET label = ?, description = ?, points_json = ?, color = ?,
                    music_url = ?, music_urls_json = ?, music_volume = ?, updated_at = NOW()
              WHERE id = ? AND chapter_id = ?`,
            [
              payload.label,
              payload.description,
              JSON.stringify(payload.points),
              payload.color,
              payload.musicUrl,
              musicUrlsJson,
              payload.musicVolume,
              targetId,
              chapterId,
            ],
          );
        }
        report.totals.zones_synced += 1;
      } else if (!dryRun) {
        const musicUrlsJson = payload.musicUrls?.length
          ? JSON.stringify(payload.musicUrls)
          : null;
        const result = await execute(
          `INSERT INTO gl_kingdom_zones
             (chapter_id, label, description, points_json, color, music_url, music_urls_json, music_volume, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            chapterId,
            payload.label,
            payload.description,
            JSON.stringify(payload.points),
            payload.color,
            payload.musicUrl,
            musicUrlsJson,
            payload.musicVolume,
            createdBy,
          ],
        );
        keptIds.add(Number(result.insertId));
        report.totals.zones_synced += 1;
      } else {
        report.totals.zones_synced += 1;
      }
    }

    if (syncZones) {
      const toDelete = existingZones.map((z) => Number(z.id)).filter((id) => !keptIds.has(id));
      if (toDelete.length > 0) {
        report.totals.zones_deleted += toDelete.length;
        if (!dryRun) {
          const placeholders = toDelete.map(() => '?').join(', ');
          await execute(
            `DELETE FROM gl_kingdom_zones WHERE chapter_id = ? AND id IN (${placeholders})`,
            [chapterId, ...toDelete],
          );
        }
      }
    }
  }
}

async function applyChaptersImport(deps, parsed, options = {}) {
  const { queryAll, execute } = deps;
  const dryRun = !!options.dryRun;
  const syncReperes = !!options.syncReperes && parsed.hasMarkersSheet;
  const syncZones = !!options.syncZones && parsed.hasZonesSheet;

  const chapterRows = parsed.chapterRows || [];
  const markerRows = parsed.markerRows || [];
  const zoneRows = parsed.zoneRows || [];
  const charteRows = parsed.charteRows || [];

  const report = buildImportReportBase(
    dryRun,
    chapterRows.length + markerRows.length + zoneRows.length + charteRows.length,
  );

  if (chapterRows.length > MAX_CHAPTER_ROWS) {
    throw new Error(`Trop de lignes chapitres (max ${MAX_CHAPTER_ROWS})`);
  }
  if (markerRows.length > MAX_MARKER_ROWS) {
    throw new Error(`Trop de lignes repères (max ${MAX_MARKER_ROWS})`);
  }
  if (zoneRows.length > MAX_ZONE_ROWS) {
    throw new Error(`Trop de lignes zones (max ${MAX_ZONE_ROWS})`);
  }

  const existingRows = await queryAll(
    'SELECT id, slug, title, biome, map_image_url, story_markdown, biotope_markdown, biocenose_markdown, sortileges_markdown, souffle_face, plateau_number, order_index FROM gl_chapters',
  );
  const existingBySlug = new Map(existingRows.map((r) => [String(r.slug), r]));
  const chapterIdBySlug = new Map(existingRows.map((r) => [String(r.slug), Number(r.id)]));

  const validChapters = [];
  for (let i = 0; i < chapterRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildChapterPayload(chapterRows[i]);
    const rowErrors = validateChapterPayload(payload, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      report.totals.skipped_invalid += 1;
      continue;
    }

    const existing = existingBySlug.get(payload.slug);
    if (!existing && !payload.hasTitle) {
      report.errors.push({
        row: rowNumber,
        field: 'titre',
        error: 'Chapitre introuvable : titre requis pour créer un nouveau chapitre',
      });
      report.totals.skipped_invalid += 1;
      continue;
    }

    if (payload.hasBiomeSlugs) {
      const biomeError = await validateBiomeSlugsExist({ queryAll }, payload.biomeSlugs);
      if (biomeError) {
        report.errors.push({ row: rowNumber, field: 'biomes_slugs', error: biomeError });
        report.totals.skipped_invalid += 1;
        continue;
      }
    }
    if (payload.hasSpellCodes) {
      const spellError = await validateSpellCodesExist({ queryAll }, payload.spellCodes);
      if (spellError) {
        report.errors.push({ row: rowNumber, field: 'sorts_codes', error: spellError });
        report.totals.skipped_invalid += 1;
        continue;
      }
    }

    validChapters.push({ rowNumber, payload, existing });
  }

  report.totals.valid = validChapters.length;
  report.preview = validChapters.slice(0, 5).map(({ payload, existing }) => ({
    slug: payload.slug,
    title: payload.title || existing?.title || payload.slug,
  }));

  const knownChapterSlugs = new Set(chapterIdBySlug.keys());
  for (const { payload } of validChapters) {
    knownChapterSlugs.add(payload.slug);
  }

  const validMarkers = [];
  if (parsed.hasMarkersSheet && markerRows.length > 0) {
    for (let i = 0; i < markerRows.length; i += 1) {
      const rowNumber = i + 2;
      const payload = buildMarkerPayload(markerRows[i]);
      const rowErrors = validateMarkerPayload(payload, rowNumber, knownChapterSlugs);
      if (rowErrors.length) {
        report.errors.push(...rowErrors);
        continue;
      }
      validMarkers.push({ rowNumber, payload });
    }
  }

  const validZones = [];
  if (parsed.hasZonesSheet && zoneRows.length > 0) {
    for (let i = 0; i < zoneRows.length; i += 1) {
      const rowNumber = i + 2;
      const payload = buildZonePayload(zoneRows[i]);
      const rowErrors = validateZonePayload(payload, rowNumber, knownChapterSlugs);
      if (rowErrors.length) {
        report.errors.push(...rowErrors);
        continue;
      }
      validZones.push({ rowNumber, payload });
    }
  }

  if (dryRun) {
    for (const { existing } of validChapters) {
      if (existing) report.totals.updated += 1;
      else report.totals.created += 1;
    }
    if (validMarkers.length > 0) {
      report.totals.markers_synced = validMarkers.length;
    }
    if (validZones.length > 0) {
      report.totals.zones_synced = validZones.length;
    }
    if (parsed.hasCharteSheet && charteRows.length > 0) {
      const charteReport = await applyChapterCharteImport({ queryAll, execute }, charteRows, {
        dryRun: true,
      });
      report.totals.charte_updated =
        (charteReport.totals.updated || 0) + (charteReport.totals.created || 0);
      report.errors.push(...(charteReport.errors || []));
    }
    return report;
  }

  for (const { payload, existing } of validChapters) {
    if (existing) {
      const updates = [];
      const params = [];

      if (payload.hasTitle) {
        updates.push('title = ?');
        params.push(payload.title);
      }
      if (payload.hasBiome) {
        updates.push('biome = ?');
        params.push(payload.biome);
      }
      if (payload.hasOrderIndex) {
        updates.push('order_index = ?');
        params.push(payload.orderIndex);
      }
      if (payload.hasMapImageUrl) {
        updates.push('map_image_url = ?');
        params.push(payload.mapImageUrl);
      }
      if (payload.hasStoryMarkdown) {
        updates.push('story_markdown = ?');
        params.push(payload.storyMarkdown);
      }
      if (payload.hasBiotopeMarkdown) {
        updates.push('biotope_markdown = ?');
        params.push(payload.biotopeMarkdown);
      }
      if (payload.hasBiocenoseMarkdown) {
        updates.push('biocenose_markdown = ?');
        params.push(payload.biocenoseMarkdown);
      }
      if (payload.hasSortilegesMarkdown) {
        updates.push('sortileges_markdown = ?');
        params.push(payload.sortilegesMarkdown);
      }
      if (payload.hasSouffleFace) {
        updates.push('souffle_face = ?');
        params.push(payload.souffleFace);
      }
      if (payload.hasPlateauNumber) {
        updates.push('plateau_number = ?');
        params.push(payload.plateauNumber);
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        params.push(existing.id);
        await execute(`UPDATE gl_chapters SET ${updates.join(', ')} WHERE id = ?`, params);
        report.totals.updated += 1;
      }

      if (payload.hasBiomeSlugs) {
        await syncChapterBiomes({ queryAll, execute }, existing.id, payload.biomeSlugs);
      }
      if (payload.hasSpellCodes) {
        await syncChapterSpells({ queryAll, execute }, existing.id, payload.spellCodes);
      }
    } else {
      await execute(
        `INSERT INTO gl_chapters (slug, title, biome, map_image_url, story_markdown,
                                   biotope_markdown, biocenose_markdown, sortileges_markdown,
                                   souffle_face, plateau_number, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          payload.slug,
          payload.title,
          payload.hasBiome ? payload.biome : null,
          payload.hasMapImageUrl ? payload.mapImageUrl : null,
          payload.hasStoryMarkdown ? payload.storyMarkdown : '',
          payload.hasBiotopeMarkdown ? payload.biotopeMarkdown : '',
          payload.hasBiocenoseMarkdown ? payload.biocenoseMarkdown : '',
          payload.hasSortilegesMarkdown ? payload.sortilegesMarkdown : '',
          payload.hasSouffleFace ? payload.souffleFace : null,
          payload.hasPlateauNumber ? payload.plateauNumber : null,
          payload.hasOrderIndex ? payload.orderIndex : 0,
        ],
      );
      const inserted = await queryAll('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
        payload.slug,
      ]);
      const newId = inserted[0] ? Number(inserted[0].id) : null;
      if (newId) {
        chapterIdBySlug.set(payload.slug, newId);
        existingBySlug.set(payload.slug, { id: newId, slug: payload.slug });
      }
      if (payload.hasBiomeSlugs && newId) {
        await syncChapterBiomes({ queryAll, execute }, newId, payload.biomeSlugs);
      }
      if (payload.hasSpellCodes && newId) {
        await syncChapterSpells({ queryAll, execute }, newId, payload.spellCodes);
      }
      report.totals.created += 1;
    }
  }

  if (validMarkers.length > 0) {
    await applyMarkersImport(deps, validMarkers, { dryRun, syncReperes }, report, chapterIdBySlug);
  }

  if (validZones.length > 0) {
    await applyZonesImport(
      deps,
      validZones,
      { dryRun, syncZones, createdBy: options.createdBy ?? null },
      report,
      chapterIdBySlug,
    );
  }

  if (parsed.hasCharteSheet && charteRows.length > 0) {
    const charteReport = await applyChapterCharteImport({ queryAll, execute }, charteRows, {
      dryRun: false,
    });
    report.totals.charte_updated =
      (charteReport.totals.updated || 0) + (charteReport.totals.created || 0);
    report.errors.push(...(charteReport.errors || []));
  }

  return report;
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_CHAPTER_ROWS,
  MAX_MARKER_ROWS,
  MAX_ZONE_ROWS,
  CHAPTERS_SHEET,
  MARKERS_SHEET,
  ZONES_SHEET,
  EXPORT_SCOPES,
  CHAPTERS_TEMPLATE_HEADERS,
  CHAPTERS_TEMPLATE_SAMPLE_ROW,
  MARKERS_TEMPLATE_HEADERS,
  ZONES_TEMPLATE_HEADERS,
  normalizeExportScope,
  buildChapterPayload,
  validateChapterPayload,
  buildMarkerPayload,
  validateMarkerPayload,
  buildZonePayload,
  validateZonePayload,
  parseChaptersWorkbook,
  resolveChaptersImportRows,
  loadChaptersExportData,
  buildChaptersTemplateWorkbook,
  buildChaptersExportWorkbook,
  buildChaptersWorkbookFromData,
  applyChaptersImport,
};
