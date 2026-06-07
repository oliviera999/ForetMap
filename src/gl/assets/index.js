import embeddedImages from './manifest.images.json';
import embeddedAudio from './manifest.audio.json';
import placeholderUrl from './placeholder.svg?url';
import { biomeAssetSlug } from '../data/biomes.registry.js';

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
  const mapped = imagesManifest?.[key] || key;
  const entry = keysIndex?.[mapped];
  if (entry?.relativePath) {
    return `/uploads/${entry.relativePath.replace(/\\/g, '/')}`;
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
  const url = resolveStableKey(key, getKeysIndex(), getImagesManifest());
  if (!url) {
    warnMissing(key, 'img');
    return placeholderUrl;
  }
  return url;
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
  const url = resolveStableKey(stableKey, getKeysIndex(), getImagesManifest());
  if (!url) {
    warnMissing(stableKey, 'audio');
    return { url: null, loop: entry?.loop ?? true, gain: entry?.gain ?? 0.7 };
  }
  return { url, loop: entry?.loop ?? true, gain: entry?.gain ?? 0.7 };
}

export function feuilletIllustration(code) {
  const prefix = `recit_feuillet-action_${String(code || '').trim()}_`;
  if (!prefix.endsWith('_')) return null;
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
  const n = Number(plateauNumber);
  if (!Number.isFinite(n) || n < 1 || n > 5) return placeholderUrl;
  return img(`plateau-${n}_fond`);
}

export { placeholderUrl as GL_ASSET_PLACEHOLDER_URL };
