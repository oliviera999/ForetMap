'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  MAX_ARCHIVE_BYTES,
  MAX_DECOMPRESSED_BYTES,
  MAX_FILE_COUNT,
} = require('./contentLibraryUpload');
const {
  visitMascotPackAssetRelativeDir,
  sanitizeMascotPackAssetFilename,
  visitMascotSpriteLibraryRelativeDir,
  visitMascotSpriteLibraryAssetsApiPrefix,
} = require('./visitMascotPackHelpers');
const { getAbsolutePath } = require('./uploads');

const PUBLIC_ROOT = path.resolve(__dirname, '..', 'public');
const ARCHIVE_FORMAT = 'foretmap-mascot-pack-archive';
const ARCHIVE_FORMAT_VERSION = 1;
const PORTABLE_FRAMES_BASE = './assets/';
const MANIFEST_NAME = 'manifest.json';
const PACK_JSON_NAME = 'pack.json';

function archiveError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function slugifyArchiveFilename(label) {
  return (
    String(label || 'pack')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'pack'
  );
}

function shouldSkipArchiveEntry(entryName) {
  const normalized = String(entryName || '').replace(/\\/g, '/');
  if (!normalized || normalized.endsWith('/')) return true;
  const base = path.basename(normalized);
  if (base.startsWith('.')) return true;
  if (normalized.includes('__MACOSX/')) return true;
  if (base === '.DS_Store') return true;
  return false;
}

function normalizeZipAssetPath(entryName) {
  const normalized = String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!normalized.startsWith('assets/')) return null;
  const base = path.basename(normalized);
  if (!base || !sanitizeMascotPackAssetFilename(base)) return null;
  return `assets/${base}`;
}

function parseMascotPackZipBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw archiveError('Archive ZIP vide');
  }
  if (buffer.length > MAX_ARCHIVE_BYTES) {
    throw archiveError(`Archive trop volumineuse (max ${MAX_ARCHIVE_BYTES} octets)`);
  }
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (_) {
    throw archiveError('Archive ZIP illisible');
  }
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && !shouldSkipArchiveEntry(entry.entryName));
  if (entries.length === 0) throw archiveError('Archive ZIP sans fichiers exploitables');
  if (entries.length > MAX_FILE_COUNT) {
    throw archiveError(`Trop de fichiers dans l'archive (max ${MAX_FILE_COUNT})`);
  }

  let manifest = null;
  let pack = null;
  const assets = new Map();
  let totalSize = 0;

  for (const entry of entries) {
    const name = String(entry.entryName || '').replace(/\\/g, '/');
    const data = entry.getData();
    totalSize += data.length;
    if (totalSize > MAX_DECOMPRESSED_BYTES) {
      throw archiveError(
        `Taille décompressée trop importante (max ${MAX_DECOMPRESSED_BYTES} octets)`,
      );
    }
    if (name === MANIFEST_NAME) {
      try {
        manifest = JSON.parse(data.toString('utf8'));
      } catch (_) {
        throw archiveError('manifest.json invalide');
      }
      continue;
    }
    if (name === PACK_JSON_NAME) {
      try {
        pack = JSON.parse(data.toString('utf8'));
      } catch (_) {
        throw archiveError('pack.json invalide');
      }
      continue;
    }
    if (name.includes('..')) throw archiveError('Chemin asset interdit dans l’archive');
    const assetPath = normalizeZipAssetPath(name);
    if (!assetPath) continue;
    const resolved = path.normalize(assetPath);
    if (resolved.includes('..')) throw archiveError('Chemin asset interdit dans l’archive');
    assets.set(assetPath, data);
  }

  if (!manifest || typeof manifest !== 'object') {
    throw archiveError('manifest.json manquant');
  }
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw archiveError('pack.json manquant');
  }
  if (manifest.format !== ARCHIVE_FORMAT) {
    throw archiveError(`Format d’archive non supporté (${String(manifest.format || '')})`);
  }
  if (Number(manifest.formatVersion) !== ARCHIVE_FORMAT_VERSION) {
    throw archiveError(`Version d’archive non supportée (${manifest.formatVersion})`);
  }
  const variant = String(manifest.variant || '').trim();
  if (variant !== 'visit' && variant !== 'gl') {
    throw archiveError('variant manifest invalide (visit ou gl attendu)');
  }

  return {
    manifest,
    pack,
    assets,
    warnings: Array.isArray(manifest.warnings) ? manifest.warnings.map(String) : [],
  };
}

function buildMascotPackZipBuffer({ manifest, pack, assetFiles }) {
  const zip = new AdmZip();
  zip.addFile(MANIFEST_NAME, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  zip.addFile(PACK_JSON_NAME, Buffer.from(JSON.stringify(pack, null, 2), 'utf8'));
  for (const file of assetFiles || []) {
    const zipPath = String(file.zipPath || '').replace(/\\/g, '/');
    if (!zipPath.startsWith('assets/') || !Buffer.isBuffer(file.buffer)) continue;
    zip.addFile(zipPath, file.buffer);
  }
  return zip.toBuffer();
}

function readFileIfExists(absPath) {
  try {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      return fs.readFileSync(absPath);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function resolvePublicAssetPath(urlPath) {
  const p = String(urlPath || '').trim();
  if (!p.startsWith('/assets/')) return null;
  const rel = p.replace(/^\/+/, '');
  const abs = path.resolve(PUBLIC_ROOT, rel);
  if (!abs.startsWith(PUBLIC_ROOT + path.sep) && abs !== PUBLIC_ROOT) return null;
  return abs;
}

function resolveUploadsPath(urlPath) {
  const p = String(urlPath || '').trim();
  if (!p.startsWith('/uploads/')) return null;
  const rel = p.replace(/^\/uploads\//, '');
  try {
    return getAbsolutePath(rel);
  } catch (_) {
    return null;
  }
}

function resolveVisitAssetAbsolute(ref, ctx = {}) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return null;

  const packId = String(ctx.packId || '').trim();
  const mapId = String(ctx.mapId || '').trim();
  const packPrefix =
    packId && /^[0-9a-f-]{36}$/i.test(packId) ? `/api/visit/mascot-packs/${packId}/assets/` : null;
  const libPrefix = visitMascotSpriteLibraryAssetsApiPrefix(mapId);

  if (packPrefix && raw.startsWith(packPrefix)) {
    const filename = sanitizeMascotPackAssetFilename(raw.slice(packPrefix.length));
    if (!filename) return null;
    const rel = visitMascotPackAssetRelativeDir(packId);
    return rel ? getAbsolutePath(`${rel}/${filename}`) : null;
  }
  if (libPrefix && raw.startsWith(libPrefix)) {
    const filename = sanitizeMascotPackAssetFilename(raw.slice(libPrefix.length));
    if (!filename) return null;
    const rel = visitMascotSpriteLibraryRelativeDir(mapId);
    return rel ? getAbsolutePath(`${rel}/${filename}`) : null;
  }
  if (raw.startsWith('/assets/')) return resolvePublicAssetPath(raw);
  if (raw.startsWith('/uploads/')) return resolveUploadsPath(raw);

  const base = String(ctx.framesBase || '').trim();
  if (base && !/^https?:\/\//i.test(base)) {
    const normBase = base.endsWith('/') ? base : `${base}/`;
    const filename = sanitizeMascotPackAssetFilename(raw);
    if (filename && packPrefix && normBase.startsWith(packPrefix)) {
      const rel = visitMascotPackAssetRelativeDir(packId);
      return rel ? getAbsolutePath(`${rel}/${filename}`) : null;
    }
    if (filename && libPrefix && normBase.startsWith(libPrefix)) {
      const rel = visitMascotSpriteLibraryRelativeDir(mapId);
      return rel ? getAbsolutePath(`${rel}/${filename}`) : null;
    }
    if (filename && normBase.startsWith('/assets/')) {
      return resolvePublicAssetPath(`${normBase}${filename}`);
    }
    if (raw.startsWith(normBase)) {
      const tail = raw.slice(normBase.length);
      return resolveVisitAssetAbsolute(tail.startsWith('/') ? tail : `${normBase}${tail}`, {
        packId,
        mapId,
      });
    }
  }

  if (raw.startsWith('/')) {
    return resolvePublicAssetPath(raw) || resolveUploadsPath(raw);
  }
  return null;
}

function uniqueZipAssetName(used, filename) {
  const safe = sanitizeMascotPackAssetFilename(filename) || 'frame.png';
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const ext = path.extname(safe) || '.png';
  const stem = path.basename(safe, ext);
  let i = 1;
  while (used.has(`${stem}-${i}${ext}`)) i += 1;
  const next = `${stem}-${i}${ext}`;
  used.add(next);
  return next;
}

function collectVisitPackAssets(pack, ctx = {}) {
  const warnings = [];
  const usedNames = new Set();
  const files = [];
  const fileNameBySource = new Map();

  const addRef = (ref) => {
    const abs = resolveVisitAssetAbsolute(ref, {
      packId: ctx.packId,
      mapId: ctx.mapId,
      framesBase: pack.framesBase,
    });
    if (!abs) {
      if (/^https?:\/\//i.test(String(ref || ''))) {
        warnings.push(`URL externe non embarquée : ${ref}`);
      }
      return null;
    }
    const buf = readFileIfExists(abs);
    if (!buf) {
      warnings.push(`Fichier introuvable : ${ref}`);
      return null;
    }
    if (fileNameBySource.has(ref)) return fileNameBySource.get(ref);
    const zipName = uniqueZipAssetName(usedNames, path.basename(abs));
    fileNameBySource.set(ref, zipName);
    files.push({
      zipName,
      zipPath: `assets/${zipName}`,
      buffer: buf,
      sourceRef: ref,
    });
    return zipName;
  };

  const stateFrames =
    pack?.stateFrames && typeof pack.stateFrames === 'object' ? pack.stateFrames : {};
  for (const spec of Object.values(stateFrames)) {
    if (!spec || typeof spec !== 'object') continue;
    for (const f of Array.isArray(spec.files) ? spec.files : []) addRef(f);
    for (const u of Array.isArray(spec.srcs) ? spec.srcs : []) addRef(u);
  }

  return { files, fileNameBySource, warnings };
}

function buildPortableVisitPack(pack, fileNameBySource) {
  const next = JSON.parse(JSON.stringify(pack || {}));
  next.framesBase = PORTABLE_FRAMES_BASE;
  const stateFrames =
    next.stateFrames && typeof next.stateFrames === 'object' ? next.stateFrames : {};
  for (const [stateKey, spec] of Object.entries(stateFrames)) {
    if (!spec || typeof spec !== 'object') continue;
    const fps = spec.fps != null ? Number(spec.fps) || 8 : 8;
    const names = [];
    for (const f of Array.isArray(spec.files) ? spec.files : []) {
      const n = fileNameBySource.get(String(f)) || fileNameBySource.get(String(f).trim());
      if (n) names.push(n);
    }
    for (const u of Array.isArray(spec.srcs) ? spec.srcs : []) {
      const n = fileNameBySource.get(String(u)) || fileNameBySource.get(String(u).trim());
      if (n) names.push(n);
    }
    const dwell = Array.isArray(spec.frameDwellMs) ? spec.frameDwellMs : null;
    const entry = { files: names, fps };
    if (dwell && dwell.length === names.length) entry.frameDwellMs = dwell;
    stateFrames[stateKey] = entry;
  }
  next.stateFrames = stateFrames;
  return next;
}

function visitPackApiAssetsPrefix(packUuid) {
  const id = String(packUuid || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return `/api/visit/mascot-packs/${id}/assets/`;
}

/**
 * Ramène une référence importée (portable, API absolue, statique) au basename attendu
 * dans `stateFrames.<état>.files` une fois `framesBase` fixé sur le pack serveur.
 * @param {string} name
 * @returns {string}
 */
function normalizeImportedFrameFileRef(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(PORTABLE_FRAMES_BASE)) {
    return path.basename(trimmed) || trimmed;
  }
  const packAssetMatch = trimmed.match(
    /\/api\/visit\/mascot-packs\/[0-9a-f-]{36}\/assets\/([^/?#]+)/i,
  );
  if (packAssetMatch) return packAssetMatch[1];
  if (trimmed.startsWith('/api/visit/mascot-sprite-library/')) {
    return path.basename(trimmed) || trimmed;
  }
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/uploads/')) {
    return path.basename(trimmed) || trimmed;
  }
  if (!trimmed.includes('/')) return trimmed;
  return path.basename(trimmed) || trimmed;
}

/**
 * Réécrit une spécification d'état importée (`{ files?, srcs?, fps?, frameDwellMs? }`) en mode
 * `files` (basenames `.png`, dédupliqués, `fps` garanti) une fois `framesBase` fixé sur le pack
 * serveur. Partagé par les deux formes acceptées (`stateFrames` objet et `states[]` tableau).
 * @param {Record<string, unknown>} spec
 * @returns {{ files: string[], fps: number, frameDwellMs?: number[] }}
 */
function rewriteImportedStateSpec(spec) {
  const fps = spec.fps != null ? Number(spec.fps) || 8 : 8;
  const dwell = Array.isArray(spec.frameDwellMs) ? spec.frameDwellMs : null;
  const ordered = [];
  const seen = new Set();
  const pushName = (raw) => {
    const base = normalizeImportedFrameFileRef(raw);
    if (!base || !base.toLowerCase().endsWith('.png')) return;
    if (seen.has(base)) return;
    seen.add(base);
    ordered.push(base);
  };
  for (const f of Array.isArray(spec.files) ? spec.files : []) pushName(f);
  for (const u of Array.isArray(spec.srcs) ? spec.srcs : []) pushName(u);
  const entry = { files: ordered, fps };
  if (dwell && dwell.length === ordered.length) entry.frameDwellMs = dwell;
  return entry;
}

/**
 * Prépare le pack importé pour le stockage serveur (`framesBase` = dossier API du pack,
 * `files` en basenames). Accepte **les deux formes** : `stateFrames` (objet, historique) **et**
 * `states[]` (tableau unifié, aligné GL) — pour la forme tableau on conserve `states[]` et on
 * laisse `normalizeUnifiedStates` (côté validation) la désucrer (clés non canoniques → customStates).
 * @param {Record<string, unknown>} pack
 * @param {string} packUuid
 * @returns {Record<string, unknown>}
 */
function rewriteVisitPackForServerImport(pack, packUuid) {
  const prefix = visitPackApiAssetsPrefix(packUuid);
  if (!prefix) throw archiveError('UUID pack invalide pour import');
  const next = JSON.parse(JSON.stringify(pack || {}));
  next.framesBase = prefix;
  // Forme unifiée `states[]` : réécrit les refs dans chaque entrée, conserve la forme tableau.
  if (Array.isArray(next.states)) {
    next.states = next.states.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const rewritten = rewriteImportedStateSpec(entry);
      const out = { key: entry.key, ...rewritten };
      if (entry.label != null) out.label = entry.label;
      return out;
    });
    return next;
  }
  const stateFrames =
    next.stateFrames && typeof next.stateFrames === 'object' ? next.stateFrames : {};
  for (const [stateKey, spec] of Object.entries(stateFrames)) {
    if (!spec || typeof spec !== 'object') continue;
    stateFrames[stateKey] = rewriteImportedStateSpec(spec);
  }
  next.stateFrames = stateFrames;
  return next;
}

/**
 * Convertit un pack visite (`stateFrames` + `customStates`) vers la **forme unifiée `states[]`**
 * (aligné GL) pour l'export portable. Miroir CJS de `mascotPackToUnifiedStates`/`packToUnifiedForm`
 * (`src/utils/mascotPack.js`) ; round-trip sans perte (l'import re-désucre via `normalizeUnifiedStates`,
 * qui re-dérive `customStates` à partir des clés non canoniques). Sans dépendance ESM (frontière CJS).
 * @param {Record<string, unknown>} pack
 * @returns {Record<string, unknown>}
 */
function visitPackToUnifiedForm(pack) {
  if (!pack || typeof pack !== 'object') return pack;
  const labelByKey = {};
  for (const cs of Array.isArray(pack.customStates) ? pack.customStates : []) {
    if (cs && cs.key) labelByKey[cs.key] = cs.label || cs.key;
  }
  const states = [];
  const stateFrames =
    pack.stateFrames && typeof pack.stateFrames === 'object' ? pack.stateFrames : {};
  for (const [key, spec] of Object.entries(stateFrames)) {
    const entry = { key };
    if (labelByKey[key]) entry.label = labelByKey[key];
    if (spec && typeof spec === 'object') {
      if (Array.isArray(spec.srcs)) entry.srcs = spec.srcs;
      if (Array.isArray(spec.files)) entry.files = spec.files;
      if (spec.fps != null) entry.fps = spec.fps;
      if (Array.isArray(spec.frameDwellMs)) entry.frameDwellMs = spec.frameDwellMs;
    }
    states.push(entry);
  }
  const { stateFrames: _sf, customStates: _cs, ...rest } = pack;
  return { ...rest, states };
}

function collectGlPackAssets(payload) {
  const warnings = [];
  const usedNames = new Set();
  const files = [];
  const srcToZipName = new Map();
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];

  for (const asset of assets) {
    const src = String(asset?.src || '').trim();
    if (!src) continue;
    let abs = null;
    if (src.startsWith('/uploads/')) abs = resolveUploadsPath(src);
    else if (src.startsWith('/assets/')) abs = resolvePublicAssetPath(src);
    else if (/^https?:\/\//i.test(src)) {
      warnings.push(`URL externe non embarquée : ${src}`);
      continue;
    }
    if (!abs) {
      warnings.push(`Asset GL introuvable : ${src}`);
      continue;
    }
    const buf = readFileIfExists(abs);
    if (!buf) {
      warnings.push(`Fichier GL introuvable : ${src}`);
      continue;
    }
    const zipName = uniqueZipAssetName(usedNames, path.basename(abs));
    srcToZipName.set(src, zipName);
    files.push({ zipName, zipPath: `assets/${zipName}`, buffer: buf, sourceRef: src });
  }

  return { files, srcToZipName, warnings };
}

function buildPortableGlPayload(payload, srcToZipName) {
  const next = JSON.parse(JSON.stringify(payload || {}));
  const assets = Array.isArray(next.assets) ? next.assets : [];
  for (const asset of assets) {
    const src = String(asset?.src || '').trim();
    const zipName = srcToZipName.get(src);
    if (zipName) asset.src = `${PORTABLE_FRAMES_BASE}${zipName}`;
  }
  next.assets = assets;
  return next;
}

function rewriteGlPayloadForServerImport(payload, filenameToUploadUrl) {
  const next = JSON.parse(JSON.stringify(payload || {}));
  const assets = Array.isArray(next.assets) ? next.assets : [];
  for (const asset of assets) {
    const src = String(asset?.src || '').trim();
    if (src.startsWith(PORTABLE_FRAMES_BASE)) {
      const zipName = path.basename(src);
      const uploadUrl = filenameToUploadUrl.get(zipName);
      if (uploadUrl) asset.src = uploadUrl;
    }
  }
  next.assets = assets;
  return next;
}

/**
 * @param {{
 *   packRow: Record<string, unknown>,
 *   packJson: Record<string, unknown>,
 *   mapId?: string,
 *   unified?: boolean,
 * }} args `unified: true` émet `pack.json` en forme `states[]` (aligné GL) au lieu de `stateFrames`.
 */
function buildVisitExportArchive({ packRow, packJson, mapId, unified = false }) {
  const collected = collectVisitPackAssets(packJson, {
    packId: packRow.id,
    mapId,
  });
  const portablePack = buildPortableVisitPack(packJson, collected.fileNameBySource);
  const exportedPack = unified ? visitPackToUnifiedForm(portablePack) : portablePack;
  const manifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    variant: 'visit',
    statesForm: unified ? 'unified' : 'stateFrames',
    exportedAt: new Date().toISOString(),
    source: {
      pack_id: packRow.id,
      map_id: mapId || packRow.map_id,
      catalog_id: packRow.catalog_id,
      label: packRow.label,
      is_published: !!Number(packRow.is_published),
    },
    warnings: collected.warnings,
  };
  return { manifest, pack: exportedPack, assetFiles: collected.files };
}

function buildGlExportArchive({ packRow, payload }) {
  const collected = collectGlPackAssets(payload);
  const portablePayload = buildPortableGlPayload(payload, collected.srcToZipName);
  const manifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    variant: 'gl',
    exportedAt: new Date().toISOString(),
    source: {
      pack_id: Number(packRow.id),
      chapter_id: packRow.chapter_id == null ? null : Number(packRow.chapter_id),
      name: packRow.name,
      version: packRow.version,
    },
    warnings: collected.warnings,
  };
  return { manifest, pack: portablePayload, assetFiles: collected.files };
}

function analyzeVisitArchive(parsed) {
  return {
    variant: 'visit',
    ok: true,
    warnings: [...(parsed.warnings || []), ...(parsed.manifest.warnings || [])],
    assetCount: parsed.assets.size,
    packId: parsed.pack?.id,
    label: parsed.pack?.label,
  };
}

function analyzeGlArchive(parsed) {
  return {
    variant: 'gl',
    ok: true,
    warnings: [...(parsed.warnings || []), ...(parsed.manifest.warnings || [])],
    assetCount: parsed.assets.size,
    packId: parsed.pack?.id,
    name: parsed.pack?.name,
  };
}

module.exports = {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  PORTABLE_FRAMES_BASE,
  MANIFEST_NAME,
  PACK_JSON_NAME,
  archiveError,
  slugifyArchiveFilename,
  parseMascotPackZipBuffer,
  buildMascotPackZipBuffer,
  collectVisitPackAssets,
  buildPortableVisitPack,
  rewriteVisitPackForServerImport,
  visitPackToUnifiedForm,
  normalizeImportedFrameFileRef,
  visitPackApiAssetsPrefix,
  collectGlPackAssets,
  buildPortableGlPayload,
  rewriteGlPayloadForServerImport,
  buildVisitExportArchive,
  buildGlExportArchive,
  analyzeVisitArchive,
  analyzeGlArchive,
  resolveVisitAssetAbsolute,
};
