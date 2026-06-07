'use strict';

const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('./uploads');

const MEDIA_LIBRARY_ROOT = 'media-library';
const MEDIA_LIBRARY_DIR = path.resolve(UPLOADS_DIR, MEDIA_LIBRARY_ROOT);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const KEYS_INDEX_FILE = '_keys.json';
const MANIFEST_IMAGES_FILE = '_manifest.images.json';
const MANIFEST_AUDIO_FILE = '_manifest.audio.json';

const LARGE_FILE_BYTES = 800 * 1024;
const ALPHA_JPG_PREFIXES = ['app_', 'embleme_'];

const AUDIO_SLOT_DEFS = [
  { slot: 'intro', prefix: 'intro_' },
  ...Array.from({ length: 5 }, (_, index) => ({
    slot: `plateau-${index + 1}`,
    prefix: `plateau-${index + 1}_`,
  })),
];

const SIDECAR_FILES = new Set([
  KEYS_INDEX_FILE,
  MANIFEST_IMAGES_FILE,
  MANIFEST_AUDIO_FILE,
]);

function deriveMediaStableKey(fileName) {
  let base = path.basename(String(fileName || '').trim());
  const dot = base.lastIndexOf('.');
  if (dot > 0) base = base.slice(0, dot);
  if (/^gl_/i.test(base)) base = base.slice(3);
  return base
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function keysIndexPath() {
  return path.join(MEDIA_LIBRARY_DIR, KEYS_INDEX_FILE);
}

function manifestImagesPath() {
  return path.join(MEDIA_LIBRARY_DIR, MANIFEST_IMAGES_FILE);
}

function manifestAudioPath() {
  return path.join(MEDIA_LIBRARY_DIR, MANIFEST_AUDIO_FILE);
}

function loadMediaKeyIndex() {
  const filePath = keysIndexPath();
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function saveMediaKeyIndex(index) {
  writeJsonAtomic(keysIndexPath(), index);
}

function registerMediaStableKey(stableKey, relativePath, originalName, meta = {}) {
  const key = String(stableKey || '').trim();
  if (!key) return null;
  const index = loadMediaKeyIndex();
  index[key] = {
    relativePath: String(relativePath || '').replace(/\\/g, '/'),
    originalName: originalName || key,
    updatedAt: new Date().toISOString(),
    ...meta,
  };
  saveMediaKeyIndex(index);
  return index[key];
}

function resolveMediaByStableKey(stableKey) {
  const key = String(stableKey || '').trim();
  if (!key) return null;
  if (key.startsWith('local:/')) {
    const localPath = key.slice('local:'.length);
    return { url: localPath, relativePath: null, stableKey: key };
  }
  const entry = loadMediaKeyIndex()[key];
  if (!entry?.relativePath) return null;
  const rel = entry.relativePath.replace(/\\/g, '/');
  return { url: `/uploads/${rel}`, relativePath: rel, stableKey: key };
}

function removeMediaStableKeysForRelativePath(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/');
  const index = loadMediaKeyIndex();
  let changed = false;
  for (const [key, entry] of Object.entries(index)) {
    if (entry?.relativePath === rel) {
      delete index[key];
      changed = true;
    }
  }
  if (changed) saveMediaKeyIndex(index);
  return changed;
}

function isSidecarFileName(fileName) {
  return SIDECAR_FILES.has(path.basename(String(fileName || '')));
}

function scanLocalSprites(rootDir = PROJECT_ROOT) {
  const spritesDir = path.join(rootDir, 'public', 'gl', 'sprites');
  const out = {};
  if (!fs.existsSync(spritesDir)) return out;
  for (const name of fs.readdirSync(spritesDir)) {
    const fullPath = path.join(spritesDir, name);
    if (!fs.statSync(fullPath).isFile()) continue;
    const slug = deriveMediaStableKey(name);
    if (!slug) continue;
    out[slug] = `local:/gl/sprites/${name}`;
  }
  return out;
}

function isAudioRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').includes('/audio/');
}

function buildImageManifest(keyIndex, localSprites = null) {
  const sprites = localSprites || scanLocalSprites();
  const images = { ...sprites };
  for (const stableKey of Object.keys(keyIndex)) {
    images[stableKey] = stableKey;
  }
  return images;
}

function buildAudioManifest(keyIndex) {
  const defaults = { loop: true, gain: 0.7 };
  const slots = {};
  const keys = Object.keys(keyIndex);
  for (const { slot, prefix } of AUDIO_SLOT_DEFS) {
    const match = keys
      .filter((key) => key.startsWith(prefix) && isAudioRelativePath(keyIndex[key]?.relativePath))
      .sort()[0] || null;
    slots[slot] = match
      ? { src: match, loop: defaults.loop, gain: defaults.gain }
      : { src: null, loop: defaults.loop, gain: defaults.gain };
  }
  return slots;
}

function collectManifestWarnings(keyIndex) {
  const warnings = [];
  for (const [stableKey, entry] of Object.entries(keyIndex)) {
    const rel = entry?.relativePath;
    if (!rel) continue;
    const absolutePath = path.resolve(UPLOADS_DIR, rel);
    if (fs.existsSync(absolutePath)) {
      const size = fs.statSync(absolutePath).size;
      if (size > LARGE_FILE_BYTES) {
        warnings.push({ type: 'large_file', stableKey, relativePath: rel, size });
      }
    }
    const original = String(entry.originalName || stableKey).toLowerCase();
    if (/\.(jpe?g)$/i.test(original) && ALPHA_JPG_PREFIXES.some((prefix) => stableKey.startsWith(prefix))) {
      warnings.push({
        type: 'alpha_jpg',
        stableKey,
        message: `Asset alpha "${stableKey}" en JPEG — préférer PNG/WebP`,
      });
    }
  }
  return warnings;
}

function syncAssetManifests(options = {}) {
  const rootDir = options.rootDir || PROJECT_ROOT;
  const keyIndex = loadMediaKeyIndex();
  const images = buildImageManifest(keyIndex, scanLocalSprites(rootDir));
  const audio = buildAudioManifest(keyIndex);
  const warnings = collectManifestWarnings(keyIndex);
  if (!options.dryRun) {
    writeJsonAtomic(manifestImagesPath(), images);
    writeJsonAtomic(manifestAudioPath(), audio);
  }
  return { images, audio, warnings, keyCount: Object.keys(keyIndex).length, imageCount: Object.keys(images).length };
}

function warnAlphaAssetIfNeeded(fileName, mimeType) {
  const stableKey = deriveMediaStableKey(fileName);
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'image/jpeg' && ALPHA_JPG_PREFIXES.some((prefix) => stableKey.startsWith(prefix))) {
    return {
      type: 'alpha_jpg',
      stableKey,
      message: `Asset alpha "${stableKey}" uploadé en JPEG — alpha perdu`,
    };
  }
  return null;
}

function copyManifestSnapshotsToSrcAssets(rootDir = PROJECT_ROOT) {
  const srcAssetsDir = path.join(rootDir, 'src', 'gl', 'assets');
  fs.mkdirSync(srcAssetsDir, { recursive: true });
  const imagesSrc = manifestImagesPath();
  const audioSrc = manifestAudioPath();
  if (fs.existsSync(imagesSrc)) {
    fs.copyFileSync(imagesSrc, path.join(srcAssetsDir, 'manifest.images.json'));
  }
  if (fs.existsSync(audioSrc)) {
    fs.copyFileSync(audioSrc, path.join(srcAssetsDir, 'manifest.audio.json'));
  }
}

module.exports = {
  MEDIA_LIBRARY_DIR,
  KEYS_INDEX_FILE,
  MANIFEST_IMAGES_FILE,
  MANIFEST_AUDIO_FILE,
  LARGE_FILE_BYTES,
  deriveMediaStableKey,
  loadMediaKeyIndex,
  registerMediaStableKey,
  resolveMediaByStableKey,
  removeMediaStableKeysForRelativePath,
  isSidecarFileName,
  scanLocalSprites,
  buildImageManifest,
  buildAudioManifest,
  collectManifestWarnings,
  syncAssetManifests,
  warnAlphaAssetIfNeeded,
  copyManifestSnapshotsToSrcAssets,
};
