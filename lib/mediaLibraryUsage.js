'use strict';

// Détection d'usage des médias de la médiathèque : pour chaque ressource
// (média-library), on indique si elle est référencée quelque part et où.
// Deux modes de référence sont reconnus :
//   1. URL directe `/uploads/media-library/...` (markdown, JSON, colonnes _url…)
//   2. Slug / clé stable (config intro G&L : scenes[].imageKey, audio.*Key)
//
// Le cœur (extraction + appariement) est pur et testable sans base. La couche
// d'accès BDD est défensive : chaque source est introspectée via SHOW COLUMNS
// et n'interroge que les colonnes réellement présentes, de sorte qu'une colonne
// absente d'un déploiement est ignorée sans jamais faire échouer le scan.

const { listMediaLibraryItems } = require('./mediaLibrary');
const { deriveMediaStableKey } = require('./glAssetManifest');
const { biomeAssetSlug, listCanonicalBiomeSlugs } = require('./glBiomesRegistry');
const { INTRO_IMAGE_KEYS } = require('./glMediaKeysAudit');
const {
  parseChapterRecitKey,
  GL_FEUILLET_RECIT_PREFIX,
} = require('../src/gl/utils/glChapterRecitConvention.js');

const ROW_LIMIT = 5000;
const MAX_LOCATIONS_PER_ITEM = 80;

// --- Cœur pur ---------------------------------------------------------------

const URL_REF_RE = /uploads\/media-library\/[A-Za-z0-9._\-/]+/g;

/** Extrait les chemins relatifs `media-library/...` référencés dans une valeur. */
function extractMediaUrlRefs(value) {
  if (value == null) return [];
  const text = typeof value === 'string' ? value : String(value);
  const out = [];
  let match;
  URL_REF_RE.lastIndex = 0;
  while ((match = URL_REF_RE.exec(text)) !== null) {
    const idx = match[0].indexOf('media-library/');
    if (idx >= 0) out.push(match[0].slice(idx));
  }
  return out;
}

/** Extrait les slugs (clés stables) référencés dans une config intro G&L. */
function extractIntroSlugRefs(value) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_) {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const out = [];
  if (Array.isArray(parsed.scenes)) {
    for (const scene of parsed.scenes) {
      const slug = scene?.imageKey != null ? String(scene.imageKey).trim() : '';
      if (slug) out.push({ slug, field: scene?.id ? `scène ${scene.id}` : 'scène' });
    }
  }
  const loopKey = parsed.audio?.loopKey != null ? String(parsed.audio.loopKey).trim() : '';
  if (loopKey) out.push({ slug: loopKey, field: 'audio (boucle)' });
  const finalKey = parsed.audio?.finalKey != null ? String(parsed.audio.finalKey).trim() : '';
  if (finalKey) out.push({ slug: finalKey, field: 'audio (final)' });
  return out;
}

/** Construit les index d'appariement (chemin et slug) à partir des médias listés. */
function buildItemLookup(items = []) {
  const byPath = new Map();
  const bySlug = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const rel = String(item?.relativePath || '').replace(/\\/g, '/');
    if (rel) byPath.set(rel, rel);
    const slug = item?.stableKey ? String(item.stableKey) : '';
    if (slug) bySlug.set(slug, rel);
  }
  return { byPath, bySlug };
}

/** Résout une référence (url ou slug) vers le chemin relatif d'un média connu. */
function resolveRef(lookup, ref) {
  if (!ref) return null;
  if (ref.kind === 'url') {
    return lookup.byPath.get(ref.value) || null;
  }
  if (ref.kind === 'slug') {
    if (lookup.bySlug.has(ref.value)) return lookup.bySlug.get(ref.value);
    const derived = deriveMediaStableKey(ref.value);
    if (derived && lookup.bySlug.has(derived)) return lookup.bySlug.get(derived);
  }
  return null;
}

function locationDedupKey(location) {
  return `${location.table || ''}:${location.id ?? ''}:${location.field || ''}`;
}

/** Ajoute une référence résolue à l'index d'usage (déduplication par emplacement). */
function addUsage(usageMap, lookup, ref, location) {
  const relativePath = resolveRef(lookup, ref);
  if (!relativePath) return;
  let entry = usageMap.get(relativePath);
  if (!entry) {
    entry = { count: 0, _seen: new Set(), locations: [] };
    usageMap.set(relativePath, entry);
  }
  const key = locationDedupKey(location);
  if (entry._seen.has(key)) return;
  entry._seen.add(key);
  if (entry.locations.length < MAX_LOCATIONS_PER_ITEM) {
    entry.locations.push({
      app: location.app,
      kind: location.kind,
      label: location.label,
      field: location.field,
      id: location.id ?? null,
    });
  }
  entry.count += 1;
}

function usageMapToObject(usageMap) {
  const out = {};
  for (const [relativePath, entry] of usageMap.entries()) {
    out[relativePath] = { count: entry.count, locations: entry.locations };
  }
  return out;
}

function rowLabel(source, row, labelColumn) {
  if (labelColumn && row[labelColumn] != null && String(row[labelColumn]).trim()) {
    return String(row[labelColumn]).trim();
  }
  return null;
}

/** Indexe les références d'un lot de lignes pour une source (pur, sans BDD). */
function collectUsageFromRows({ source, rows, columns, app, lookup }, usageMap) {
  const cols = columns instanceof Set ? columns : new Set(columns || []);
  const refColumns = (source.refColumns || []).filter((rc) => cols.has(rc.column));
  const introColumn = source.intro && cols.has('value_json') ? 'value_json' : null;
  if (refColumns.length === 0 && !introColumn) return usageMap;

  const idColumn = (source.idCandidates || ['id']).find((c) => cols.has(c)) || null;
  const labelColumn = (source.labelCandidates || []).find((c) => cols.has(c)) || null;

  for (const row of Array.isArray(rows) ? rows : []) {
    const locBase = {
      app,
      table: source.table,
      kind: source.label,
      id: idColumn ? (row[idColumn] ?? null) : null,
      label: rowLabel(source, row, labelColumn),
    };

    for (const rc of refColumns) {
      for (const ref of extractMediaUrlRefs(row[rc.column])) {
        addUsage(usageMap, lookup, { kind: 'url', value: ref }, { ...locBase, field: rc.label || rc.column });
      }
    }

    if (introColumn) {
      const value = row[introColumn];
      const isIntro = !idColumn || String(row[idColumn]) === source.introKey;
      if (isIntro) {
        for (const slugRef of extractIntroSlugRefs(value)) {
          addUsage(usageMap, lookup, { kind: 'slug', value: slugRef.slug }, { ...locBase, field: slugRef.field });
        }
      }
      for (const ref of extractMediaUrlRefs(value)) {
        addUsage(usageMap, lookup, { kind: 'url', value: ref }, { ...locBase, field: 'réglage' });
      }
    }
  }
  return usageMap;
}

// --- Configuration des sources ---------------------------------------------

const GL_SOURCES = [
  {
    table: 'gl_chapters',
    label: 'Chapitre',
    labelCandidates: ['title', 'titre', 'nom', 'name', 'slug', 'code'],
    refColumns: [
      { column: 'map_image_url', label: 'image de carte' },
      { column: 'story_markdown', label: 'récit' },
      { column: 'biotope_markdown', label: 'biotope' },
      { column: 'biocenose_markdown', label: 'biocénose' },
      { column: 'sortileges_markdown', label: 'sortilèges' },
      { column: 'theme_json', label: 'thème' },
      { column: 'map_image_frame_json', label: 'cadre carte' },
    ],
  },
  {
    table: 'gl_lore_feuillets',
    label: 'Feuillet de Sélène',
    labelCandidates: ['titre', 'title', 'code', 'nom', 'name'],
    refColumns: [
      { column: 'image_url', label: 'illustration' },
      { column: 'image_coupe_url', label: 'coupe' },
      { column: 'texte', label: 'texte' },
      { column: 'texte_accessible', label: 'texte accessible' },
      { column: 'idee_cle', label: 'idée clé' },
    ],
  },
  {
    table: 'gl_kingdom_zones',
    label: 'Zone du royaume',
    labelCandidates: ['name', 'nom', 'title', 'titre', 'slug', 'zone_key', 'code'],
    refColumns: [
      { column: 'popover_images_json', label: 'images popover' },
      { column: 'popover_markdown', label: 'texte popover' },
    ],
  },
  {
    table: 'gl_species',
    label: 'Espèce',
    labelCandidates: ['nom_commun', 'nom', 'name', 'espece', 'code', 'slug'],
    refColumns: [{ column: 'photo_url', label: 'photo' }],
  },
  {
    table: 'gl_qcm_questions',
    label: 'Question QCM',
    labelCandidates: ['enonce', 'question', 'intitule', 'libelle', 'code'],
    refColumns: [
      { column: 'photo_url', label: 'photo' },
      { column: 'photo_url_hd', label: 'photo HD' },
      { column: 'photo_description_url', label: 'crédit' },
      { column: 'photo_licence_url', label: 'licence' },
    ],
  },
  {
    table: 'gl_qcm_lore_questions',
    label: 'Question QCM lore',
    labelCandidates: ['enonce', 'question', 'intitule', 'libelle', 'code'],
    refColumns: [
      { column: 'photo_url', label: 'photo' },
      { column: 'photo_url_hd', label: 'photo HD' },
      { column: 'photo_description_url', label: 'crédit' },
      { column: 'photo_licence_url', label: 'licence' },
    ],
  },
  {
    table: 'gl_content_pages',
    label: 'Page de contenu',
    labelCandidates: ['title', 'titre', 'slug', 'page_key', 'name'],
    refColumns: [{ column: 'body_markdown', label: 'corps' }],
  },
  {
    table: 'gl_player_journals',
    label: 'Carnet de joueur',
    labelCandidates: ['title', 'titre', 'name'],
    refColumns: [{ column: 'body_markdown', label: 'corps' }],
  },
  {
    table: 'gl_settings',
    label: 'Intro / réglages',
    idCandidates: ['key'],
    labelCandidates: ['key'],
    refColumns: [],
    intro: true,
    introKey: 'content.intro',
  },
];

const FORETMAP_SOURCES = [
  {
    table: 'app_settings',
    label: 'Réglages du site',
    idCandidates: ['key'],
    labelCandidates: ['key'],
    refColumns: [{ column: 'value_json', label: 'réglage' }],
  },
  {
    table: 'tutorials',
    label: 'Tutoriel',
    labelCandidates: ['title', 'titre', 'slug', 'name'],
    refColumns: [
      { column: 'cover_image_url', label: 'couverture' },
      { column: 'body_markdown', label: 'corps' },
      { column: 'content_markdown', label: 'corps' },
      { column: 'body', label: 'corps' },
    ],
  },
  {
    table: 'visit_zones',
    label: 'Zone (visite)',
    labelCandidates: ['title', 'titre', 'name', 'nom', 'slug'],
    refColumns: [
      { column: 'details_text', label: 'détails' },
      { column: 'body_json', label: 'blocs' },
    ],
  },
  {
    table: 'visit_markers',
    label: 'Repère (visite)',
    labelCandidates: ['title', 'titre', 'name', 'nom', 'slug'],
    refColumns: [
      { column: 'details_text', label: 'détails' },
      { column: 'body_json', label: 'blocs' },
    ],
  },
];

function sourcesForApp(app) {
  return app === 'foretmap' ? FORETMAP_SOURCES : GL_SOURCES;
}

// --- Liaisons par convention de nommage (médiathèque G&L) --------------------
// Ces médias sont affichés en jeu sans aucune référence en base : la clé
// stable suffit (scènes de récit, feuillets, fonds de plateau, biomes, intro).
// Sans cette détection, ils apparaissent « Inutilisée » dans l'admin et
// risquent d'être supprimés.

let biomeSlugCache = null;

function knownBiomeAssetSlugs() {
  if (biomeSlugCache) return biomeSlugCache;
  const slugs = new Map();
  for (const biomeSlug of listCanonicalBiomeSlugs()) {
    for (const kind of ['biome', 'realiste', 'biocenose']) {
      for (const saison of [null, 'ete', 'hiver']) {
        if (biomeSlug !== 'toundra' && saison) continue;
        const slug = biomeAssetSlug(biomeSlug, kind, saison);
        if (slug) slugs.set(slug, `${biomeSlug}${saison ? ` (${saison})` : ''}`);
      }
    }
  }
  biomeSlugCache = slugs;
  return slugs;
}

const INTRO_IMAGE_KEY_SET = new Set(INTRO_IMAGE_KEYS);

/** Emplacements « convention » d'un média G&L d'après sa clé stable (pur). */
function conventionLocationsForItem(item) {
  const stableKey = String(item?.stableKey || '').trim();
  if (!stableKey) return [];
  const locations = [];
  const kind = 'Convention médiathèque';

  const chapterNumber = parseChapterRecitKey(stableKey);
  if (chapterNumber !== null) {
    locations.push({
      kind,
      label: chapterNumber === 0 ? 'Histoire — prologue' : `Histoire — chapitre ${chapterNumber}`,
      field: 'scène de récit',
    });
  }

  if (stableKey.startsWith(GL_FEUILLET_RECIT_PREFIX)) {
    const rest = stableKey.slice(GL_FEUILLET_RECIT_PREFIX.length);
    const code = rest.split('_')[0] || rest;
    locations.push({ kind, label: `Feuillet de Sélène ${code}`, field: 'illustration' });
  }

  const plateauMatch = stableKey.match(/^plateau-([1-5])_/);
  if (plateauMatch) {
    const isAudio = item?.mediaType === 'audio';
    locations.push({
      kind,
      label: `Plateau ${plateauMatch[1]}`,
      field: isAudio ? 'musique d’ambiance' : 'fond de plateau',
    });
  }

  const biomeRef = knownBiomeAssetSlugs().get(stableKey);
  if (biomeRef) {
    locations.push({ kind, label: `Biome ${biomeRef}`, field: 'illustration de biome' });
  }

  if (INTRO_IMAGE_KEY_SET.has(stableKey)) {
    locations.push({ kind, label: 'Intro Gnomes & Licornes', field: 'scène (clé par défaut)' });
  }

  return locations;
}

/** Indexe les liaisons par convention pour un lot de médias (pur, sans BDD). */
function collectConventionUsage(items, usageMap, lookup = null) {
  const itemList = Array.isArray(items) ? items : [];
  const resolvedLookup = lookup || buildItemLookup(itemList);
  for (const item of itemList) {
    for (const location of conventionLocationsForItem(item)) {
      addUsage(usageMap, resolvedLookup, { kind: 'slug', value: item.stableKey }, {
        app: 'gl',
        table: 'convention',
        id: item.stableKey,
        ...location,
      });
    }
  }
  return usageMap;
}

// --- Couche d'accès BDD (défensive) ----------------------------------------

async function listExistingColumns(queryAll, table) {
  try {
    const rows = await queryAll(`SHOW COLUMNS FROM \`${table}\``);
    const cols = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = row?.Field ?? row?.field ?? row?.COLUMN_NAME;
      if (name) cols.add(String(name));
    }
    return cols;
  } catch (_) {
    return new Set();
  }
}

function buildSelectColumns(source, cols) {
  const wanted = new Set();
  for (const candidate of source.idCandidates || ['id']) {
    if (cols.has(candidate)) { wanted.add(candidate); break; }
  }
  for (const candidate of source.labelCandidates || []) {
    if (cols.has(candidate)) { wanted.add(candidate); break; }
  }
  for (const rc of source.refColumns || []) {
    if (cols.has(rc.column)) wanted.add(rc.column);
  }
  if (source.intro && cols.has('value_json')) wanted.add('value_json');
  return [...wanted];
}

/**
 * Scanne la base et renvoie l'usage par chemin relatif :
 *   { 'media-library/…': { count, locations: [{ app, kind, label, field, id }] } }
 */
async function collectMediaLibraryUsage(deps, { app } = {}) {
  const queryAll = deps?.queryAll;
  if (typeof queryAll !== 'function') {
    throw new Error('collectMediaLibraryUsage requiert deps.queryAll');
  }
  const items = listMediaLibraryItems(800, { app });
  const lookup = buildItemLookup(items);
  const usageMap = new Map();

  for (const source of sourcesForApp(app)) {
    try {
      const cols = await listExistingColumns(queryAll, source.table);
      if (cols.size === 0) continue;
      const selectCols = buildSelectColumns(source, cols);
      if (selectCols.length === 0) continue;
      const selectSql = selectCols.map((c) => `\`${c}\``).join(', ');
      const rows = await queryAll(`SELECT ${selectSql} FROM \`${source.table}\` LIMIT ${ROW_LIMIT}`);
      collectUsageFromRows({ source, rows, columns: cols, app, lookup }, usageMap);
    } catch (_) {
      /* source indisponible sur ce déploiement : on ignore */
    }
  }

  if (app !== 'foretmap') {
    collectConventionUsage(items, usageMap, lookup);
  }

  return usageMapToObject(usageMap);
}

module.exports = {
  extractMediaUrlRefs,
  extractIntroSlugRefs,
  buildItemLookup,
  resolveRef,
  addUsage,
  collectUsageFromRows,
  usageMapToObject,
  buildSelectColumns,
  conventionLocationsForItem,
  collectConventionUsage,
  collectMediaLibraryUsage,
  GL_SOURCES,
  FORETMAP_SOURCES,
  sourcesForApp,
};
