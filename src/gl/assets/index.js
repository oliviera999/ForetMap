import embeddedImages from './manifest.images.json';
import embeddedAudio from './manifest.audio.json';
import placeholderUrl from './placeholder.svg?url';
import { biomeAssetSlug } from '../data/biomes.registry.js';
import { resolvePlateauBoardSlug } from '../utils/resolvePlateauBoardSlug.js';
import { resolvePlateauAudioSlug, resolveIntroAudioSlug } from '../utils/resolvePlateauAudioSlug.js';
import { normalizeGlMediaStableKey } from '../utils/glMediaStableKey.js';

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
  loadPromise = (async () => {
    try {
      const [keysRes, imagesRes, audioRes] = await Promise.all([
        fetch(KEYS_URL, { cache: 'no-store' }),
        fetch(MANIFEST_IMAGES_URL, { cache: 'no-store' }),
        fetch(MANIFEST_AUDIO_URL, { cache: 'no-store' }),
      ]);
      runtimeKeys = keysRes.ok ? await keysRes.json() : {};
      runtimeImages = imagesRes.ok ? await imagesRes.json() : embeddedImages;
      runtimeAudio = audioRes.ok ? await audioRes.json() : embeddedAudio;
    } catch (_) {
      runtimeKeys = {};
      runtimeImages = embeddedImages;
      runtimeAudio = embeddedAudio;
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
