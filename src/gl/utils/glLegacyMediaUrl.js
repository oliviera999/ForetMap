/**
 * Résolution des URLs média GL legacy (`/uploads/.../gl-plateau-*`, `gl-scene-ch*`, etc.)
 * vers les clés stables de la médiathèque (`plateau-N_*`, `recit_0N-chapN_*`, …).
 */

import { normalizeGlMediaStableKey } from './glMediaStableKey.js';

export const LEGACY_GL_MEDIA_PATH_RE = /\/uploads\/media-library\/image\/gl-/i;

/** Basename normalisé (sans GL_) → clé stable médiathèque. */
export const LEGACY_BASENAME_ALIASES = {
  'scene-ch1-point-eau-tari': 'recit_01-chap1_point-d-eau-tari',
  'scene-ch2-epreuve-grise': 'recit_02-chap2_la-grise-mediterranee',
  'scene-ch3-silence-vent': 'recit_03-chap3_foret-automne-le-silence',
  'scene-ch4-campement-selene': 'recit_04-chap4_dernier-campement-carnet',
  'scene-ch5-grotte-glace': 'recit_05-chap5_abri-de-glace-lecture-carnet',
  'scene-copiste-bougie': 'intro_02_le-copiste',
  'plateau-1-tropiques-africains': 'plateau-1_tropiques-africains',
  'plateau-2-sahara-mediterranee': 'plateau-2_sahara-mediterranee',
  'plateau-3-forets-landes-atlantiques': 'plateau-3_forets-landes-atlantiques',
  'plateau-4-eurasie-continentale': 'plateau-4_taiga-desert_froid',
  'plateau-5-toundra-arctique': 'plateau-5_toundra-arctique',
  'biome-jungle-afc-scene-liane': 'biome-realiste_jungle',
  'biome-savane-01': 'biome_savane-africaine',
  'biome-sahara-01': 'biome_sahara',
  'biome-foret-mediterraneenne-01': 'biome_foret-mediterraneenne',
  'biome-foret-caducifoliee-scene-cerf': 'biome-realiste_foret-caducifoliee',
  'biome-landes-scene': 'biome-realiste_landes-atlantiques',
  'biome-taiga-scene-voyage': 'biome-realiste_taiga',
  'biome-desert-froid-scene-gobi': 'biome-realiste_desert-froid',
  'biome-toundra-scene-ete': 'biome-realiste_toundra-ete',
  'biome-toundra-scene-ours-blanc': 'biome-realiste_toundra-hiver',
  'coupe-savane-sol': 'biocenose_savane',
  'coupe-sahara-sol': 'biocenose_sahara',
  'coupe-foret-mediterraneenne-sol': 'biocenose_foret-mediterraneenne',
  'coupe-landes-sol': 'biocenose_landes-atlantiques',
  'coupe-taiga-riviere': 'biocenose_taiga',
  'coupe-toundra-neige-sol': 'biocenose_toundra-hiver_legendee',
};

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const STORY_HERO_LEGACY_RE =
  /!\[([^\]]*)\]\(\s*\/uploads\/media-library\/image\/gl-scene-ch\d+[^)]*\)/i;

export function isLegacyGlMediaUrl(url) {
  return LEGACY_GL_MEDIA_PATH_RE.test(String(url || ''));
}

export function legacyMediaBasename(url) {
  const match = String(url || '').match(/\/([^/?#]+)$/);
  return match ? match[1] : '';
}

/** Normalise un basename legacy (`gl-plateau-*` ou `GL_plateau_*`). */
export function normalizeLegacyMediaBasename(basename) {
  let normalized = normalizeGlMediaStableKey(basename);
  if (/^gl-/i.test(normalized)) normalized = normalized.slice(3);
  return normalized;
}

function keySetFromKnown(knownKeys) {
  if (Array.isArray(knownKeys)) return new Set(knownKeys.map((k) => String(k || '').trim()).filter(Boolean));
  if (knownKeys && typeof knownKeys === 'object') {
    return new Set(Object.keys(knownKeys).map((k) => String(k || '').trim()).filter(Boolean));
  }
  return new Set();
}

/**
 * Résout une URL ou un basename legacy vers une clé stable médiathèque.
 * @param {string} urlOrBasename
 * @param {string[]|Record<string, unknown>} [knownKeys]
 * @returns {string|null}
 */
export function resolveLegacyGlStableKey(urlOrBasename, knownKeys = []) {
  const basename = String(urlOrBasename || '').includes('/')
    ? legacyMediaBasename(urlOrBasename)
    : String(urlOrBasename || '').trim();
  if (!basename) return null;

  const normalized = normalizeLegacyMediaBasename(basename);
  const keys = keySetFromKnown(knownKeys);
  const hasKeys = keys.size > 0;
  const accept = (candidate) => {
    const key = String(candidate || '').trim();
    if (!key) return null;
    if (hasKeys && !keys.has(key)) return null;
    return key;
  };

  if (hasKeys) {
    const direct = accept(normalized);
    if (direct) return direct;
  }

  const alias = LEGACY_BASENAME_ALIASES[normalized];
  if (alias) {
    const hit = accept(alias);
    if (hit) return hit;
    if (!hasKeys) return alias;
  }

  const plateau = normalized.match(/^plateau-(\d+)-(.+)$/);
  if (plateau) {
    const converted = `plateau-${plateau[1]}_${plateau[2]}`;
    const hit = accept(converted);
    if (hit) return hit;
    if (!hasKeys) return converted;
  }

  return alias || null;
}

/**
 * Réécrit une URL legacy vers l'URL résolue via `resolveUrlFn(stableKey)`.
 */
export function resolveLegacyGlMediaUrl(url, resolveUrlFn) {
  const raw = String(url || '').trim();
  if (!raw || !isLegacyGlMediaUrl(raw)) return raw;
  const stableKey = resolveLegacyGlStableKey(raw);
  if (!stableKey || typeof resolveUrlFn !== 'function') return raw;
  const resolved = resolveUrlFn(stableKey);
  return resolved && resolved !== raw ? resolved : raw;
}

/** Réécrit les images markdown dont l'URL est legacy. */
export function applyGlLegacyMediaRefs(markdown, resolveUrlFn) {
  const raw = String(markdown ?? '');
  if (!raw) return raw;
  return raw.replace(MD_IMAGE_RE, (match, alt, href) => {
    const trimmed = String(href || '').trim();
    if (trimmed.startsWith('scene:')) return match;
    const resolved = resolveLegacyGlMediaUrl(trimmed, resolveUrlFn);
    if (resolved === trimmed) return match;
    return `![${alt}](${resolved})`;
  });
}

/** Remplace l'illustration d'ouverture legacy par `scene:1` (convention Histoire). */
export function migrateStoryHeroToSceneRef(markdown) {
  const raw = String(markdown ?? '');
  if (!raw || !STORY_HERO_LEGACY_RE.test(raw)) return raw;
  return raw.replace(STORY_HERO_LEGACY_RE, '![$1](scene:1)');
}

/** Choisit l'URL du fond de plateau : convention prioritaire si `map_image_url` est legacy. */
export function resolveGlBoardImageUrl({
  mapImageUrl = null,
  conventionBoard = null,
  conventionChapter = null,
  placeholderUrl = '',
  fallbackUrl = '/maps/map-foret.svg',
}) {
  const legacyMap = mapImageUrl && isLegacyGlMediaUrl(mapImageUrl);
  const board =
    conventionBoard && conventionBoard !== placeholderUrl ? conventionBoard : null;
  const chapterCover = conventionChapter || null;

  if (legacyMap && board) return board;
  if (mapImageUrl && !legacyMap) return mapImageUrl;
  return board || chapterCover || fallbackUrl;
}
