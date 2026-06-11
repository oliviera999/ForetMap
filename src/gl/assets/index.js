import embeddedImages from './manifest.images.json';
import embeddedAudio from './manifest.audio.json';
import placeholderUrl from './placeholder.svg?url';
import { biomeAssetSlug } from '../data/biomes.registry.js';
import { resolvePlateauBoardSlug } from '../utils/resolvePlateauBoardSlug.js';
import { resolvePlateauAudioSlug, resolveIntroAudioSlug } from '../utils/resolvePlateauAudioSlug.js';
import { normalizeGlMediaStableKey } from '../utils/glMediaStableKey.js';
import { chapterRecitPrefix } from '../utils/glChapterRecitConvention.js';

const KEYS_URL = '/uploads/media-library/_keys.json';
const MANIFEST_IMAGES_URL = '/uploads/media-library/_manifest.images.json';
const MANIFEST_AUDIO_URL = '/uploads/media-library/_manifest.audio.json';

const warnedSlugs = new Set();
let runtimeKeys = null;
let runtimeImages = null;
let runtimeAudio = null;
let loadPromise = null;

const IS_DEV = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

function warnMissing(slug, context) {
  if (!IS_DEV || warnedSlugs.has(`${context}:${slug}`)) return;
  warnedSlugs.add(`${context}:${slug}`);
  console.warn(`[gl/assets] ressource manquante (${context}) : ${slug}`);
}

function resolveStableKey(stableKey, keysIndex, imagesManifest) {
  const key = String(stableKey || '').trim();
  if (!key) return null;
  if (key.startsWith('local:/')) {
    return key.slice('local:'.length);
  }
  const candidates = [key];
  const normalized = normalizeGlMediaStableKey(key);
  if (normalized && normalized !== key) candidates.push(normalized);
  for (const candidate of candidates) {
    const entry = keysIndex?.[candidate];
    if (entry?.relativePath) {
      return `/uploads/${entry.relativePath.replace(/\\/g, '/')}`;
    }
  }
  for (const candidate of candidates) {
    const mapped = imagesManifest?.[candidate];
    if (typeof mapped === 'string' && mapped.startsWith('local:/')) {
      return mapped.slice('local:'.length);
    }
  }
  return null;
}

export async function loadGlAssetRuntime() {
  if (loadPromise) return loadPromise;
  // `no-cache` (et non `no-store`) : le navigateur revalide via ETag et
  // réutilise sa copie locale tant que les manifestes n'ont pas changé.
  loadPromise = (async () => {
    try {
      const [keysRes, imagesRes, audioRes] = await Promise.all([
        fetch(KEYS_URL, { cache: 'no-cache' }),
        fetch(MANIFEST_IMAGES_URL, { cache: 'no-cache' }),
        fetch(MANIFEST_AUDIO_URL, { cache: 'no-cache' }),
      ]);
      runtimeKeys = keysRes.ok ? await keysRes.json() : {};
      runtimeImages = imagesRes.ok ? await imagesRes.json() : embeddedImages;
      runtimeAudio = audioRes.ok ? await audioRes.json() : embeddedAudio;
    } catch (_) {
      runtimeKeys = {};
      runtimeImages = embeddedImages;
      runtimeAudio = embeddedAudio;
      // Échec réseau : on sert le repli embarqué mais on ne fige pas la
      // session dessus — le prochain montage retentera le chargement.
      loadPromise = null;
    }
    return { keys: runtimeKeys, images: runtimeImages, audio: runtimeAudio };
  })();
  return loadPromise;
}

function getImagesManifest() {
  return runtimeImages || embeddedImages;
}

function getAudioManifest() {
  return runtimeAudio || embeddedAudio;
}

function getKeysIndex() {
  return runtimeKeys || {};
}

export function img(slug) {
  const key = String(slug || '').trim();
  if (!key) return placeholderUrl;
  const keysIndex = getKeysIndex();
  const imagesManifest = getImagesManifest();
  const candidates = [key];
  const normalized = normalizeGlMediaStableKey(key);
  if (normalized && normalized !== key) candidates.push(normalized);
  for (const candidate of candidates) {
    const url = resolveStableKey(candidate, keysIndex, imagesManifest);
    if (url) return url;
  }
  warnMissing(key, 'img');
  return placeholderUrl;
}

export function audioByStableKey(stableKey, defaults = {}) {
  const key = String(stableKey || '').trim();
  if (!key) {
    return { url: null, loop: defaults.loop ?? true, gain: defaults.gain ?? 0.7 };
  }
  const keysIndex = getKeysIndex();
  const candidates = [key, normalizeGlMediaStableKey(key)].filter(Boolean);
  const unique = [...new Set(candidates)];
  for (const candidate of unique) {
    const url = resolveStableKey(candidate, keysIndex, getImagesManifest());
    if (url) {
      return { url, loop: defaults.loop ?? true, gain: defaults.gain ?? 0.7 };
    }
  }
  warnMissing(key, 'audio');
  return { url: null, loop: defaults.loop ?? true, gain: defaults.gain ?? 0.7 };
}

export function audio(slug) {
  const slot = String(slug || '').trim();
  const manifest = getAudioManifest();
  const entry = manifest?.[slot];
  const stableKey = entry?.src || slot;
  if (!stableKey) {
    warnMissing(slot, 'audio');
    return { url: null, loop: entry?.loop ?? true, gain: entry?.gain ?? 0.7 };
  }
  return audioByStableKey(stableKey, { loop: entry?.loop ?? true, gain: entry?.gain ?? 0.7 });
}

export function plateauAudio(plateauNumber, biomeSlug = null, saison = null) {
  const keysIndex = getKeysIndex();
  const knownSlugs = Object.keys(keysIndex);
  const stableKey = resolvePlateauAudioSlug(plateauNumber, biomeSlug, saison, knownSlugs);
  if (stableKey) return audioByStableKey(stableKey);
  const slot = Number(plateauNumber);
  if (Number.isFinite(slot) && slot >= 1 && slot <= 5) {
    return audio(`plateau-${slot}`);
  }
  return audioByStableKey(null);
}

export function introAudio() {
  const knownSlugs = Object.keys(getKeysIndex());
  const stableKey = resolveIntroAudioSlug(knownSlugs);
  if (stableKey) return audioByStableKey(stableKey);
  return audio('intro');
}

export function feuilletIllustration(code) {
  const normalizedCode = String(code || '').trim().toLowerCase();
  const prefix = `recit_feuillet-action_${normalizedCode}_`;
  if (!normalizedCode) return null;
  const images = getImagesManifest();
  const keys = getKeysIndex();
  const match = Object.keys({ ...images, ...keys }).find((slug) => slug.startsWith(prefix));
  if (!match) return null;
  const url = img(match);
  return url === placeholderUrl ? null : url;
}

/**
 * Préfixe de clé média des illustrations de récit pour un chapitre (pays 1–5)
 * ou le prologue (0). Convention : `recit_0N-chapN_*`, `recit_00-prologue_*`
 * (source unique : utils/glChapterRecitConvention.js).
 */
export function chapterIllustrationPrefix(chapterNumber) {
  return chapterRecitPrefix(chapterNumber);
}

/** Clés médiathèque (triées) des scènes de récit d'un chapitre. */
export function chapterIllustrationKeys(chapterNumber) {
  const prefix = chapterIllustrationPrefix(chapterNumber);
  if (!prefix) return [];
  const images = getImagesManifest();
  const keys = getKeysIndex();
  return [...new Set(Object.keys({ ...images, ...keys }))]
    .filter((slug) => slug.startsWith(prefix))
    .sort();
}

/** Méta éditoriale d'une scène (légende, ordre, couverture) lue dans `_keys.json`. */
function chapterSceneMeta(entry) {
  const caption = typeof entry?.recitCaption === 'string' && entry.recitCaption.trim()
    ? entry.recitCaption.trim()
    : null;
  const orderRaw = entry?.recitOrder;
  const order = orderRaw === null || orderRaw === undefined || orderRaw === ''
    ? null
    : (Number.isFinite(Number(orderRaw)) ? Number(orderRaw) : null);
  return { caption, order, cover: entry?.recitCover === true };
}

/** Tri des scènes : `recitOrder` croissant d'abord, puis ordre des clés. */
export function sortChapterScenes(scenes) {
  return [...(Array.isArray(scenes) ? scenes : [])].sort((a, b) => {
    const ao = a?.order ?? Number.POSITIVE_INFINITY;
    const bo = b?.order ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return String(a?.key || '').localeCompare(String(b?.key || ''));
  });
}

/**
 * Liste résolue { key, url, caption, order, cover } des scènes de récit d'un
 * chapitre, triée par `recitOrder` puis clé. Les clés non résolues (média
 * absent) sont écartées.
 */
export function chapterIllustrations(chapterNumber) {
  const keysIndex = getKeysIndex();
  const list = chapterIllustrationKeys(chapterNumber)
    .map((key) => ({ key, url: img(key), ...chapterSceneMeta(keysIndex?.[key]) }))
    .filter((item) => item.url && item.url !== placeholderUrl);
  return sortChapterScenes(list);
}

/** Couverture d'un chapitre : scène marquée `recitCover`, sinon la première. */
export function chapterIllustration(chapterNumber) {
  const list = chapterIllustrations(chapterNumber);
  if (!list.length) return null;
  const cover = list.find((scene) => scene.cover);
  return (cover || list[0]).url;
}

export function biomeImg(biomeSlug, kind = 'biome', saison = null) {
  const assetSlug = biomeAssetSlug(biomeSlug, kind, saison);
  if (!assetSlug) {
    warnMissing(String(biomeSlug), `biome:${kind}`);
    return placeholderUrl;
  }
  return img(assetSlug);
}

export function plateauBoardImg(plateauNumber) {
  const keysIndex = getKeysIndex();
  const imagesManifest = getImagesManifest();
  const knownSlugs = [...new Set([...Object.keys(keysIndex), ...Object.keys(imagesManifest)])];
  const slug = resolvePlateauBoardSlug(plateauNumber, knownSlugs, keysIndex);
  if (!slug) {
    warnMissing(`plateau-${plateauNumber}`, 'plateau-board');
    return placeholderUrl;
  }
  return img(slug);
}

export { resolvePlateauBoardSlug } from '../utils/resolvePlateauBoardSlug.js';
export { resolvePlateauAudioSlug, resolveIntroAudioSlug } from '../utils/resolvePlateauAudioSlug.js';

export { placeholderUrl as GL_ASSET_PLACEHOLDER_URL };
