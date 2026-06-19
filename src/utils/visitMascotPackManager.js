import {
  serverMascotPackAssetsPrefix,
  serverMascotSpriteLibraryAssetsPrefix,
  MASCOT_PACK_FALLBACK_SILHOUETTES,
  stringifyPack,
} from './mascotPackEditorModel.js';
import { validateMascotPackV1 } from './mascotPack.js';
import { appendFileToStateFrames } from './mascotPackEditorFrames.js';
import { sanitizeMascotPackDraft } from './mascotPackValidationUi.js';

/**
 * Validation stricte d'un pack pour sauvegarde/publication : autorise les
 * préfixes d'assets du catalogue, du pack lui-même et de la bibliothèque carte.
 * @param {Record<string, unknown>} pack
 * @param {string} packId
 * @param {string} mapId
 */
export function getPackStrictValidation(pack, packId, mapId) {
  const allowedFramesBasePrefixes = ['/assets/mascots/'];
  const packPrefix = serverMascotPackAssetsPrefix(packId);
  if (packPrefix) allowedFramesBasePrefixes.push(packPrefix);
  const libraryPrefix = serverMascotSpriteLibraryAssetsPrefix(mapId);
  if (libraryPrefix) allowedFramesBasePrefixes.push(libraryPrefix);
  return validateMascotPackV1(pack, { allowedFramesBasePrefixes });
}

/**
 * Avertissements d'édition non bloquants (silhouette inconnue, état idle absent).
 * @param {Record<string, unknown> | null | undefined} editorPack
 * @returns {string[]}
 */
export function computeEditorWarnings(editorPack) {
  const warnings = [];
  const silhouette = String(editorPack?.fallbackSilhouette || '').trim();
  if (silhouette && !MASCOT_PACK_FALLBACK_SILHOUETTES.includes(silhouette)) {
    warnings.push(`Silhouette « ${silhouette} » inconnue.`);
  }
  const stateFrames =
    editorPack?.stateFrames && typeof editorPack.stateFrames === 'object'
      ? editorPack.stateFrames
      : {};
  if (!stateFrames?.idle) {
    warnings.push(
      'État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.',
    );
  }
  return warnings;
}

/**
 * Filtre la liste d'assets globaux selon une requête texte (nom, url, source, map, catalogue).
 * @param {Array<Record<string, unknown>>} globalAssets
 * @param {string} search
 */
export function filterGlobalAssets(globalAssets, search) {
  const list = Array.isArray(globalAssets) ? globalAssets : [];
  const q = String(search || '')
    .trim()
    .toLowerCase();
  if (!q) return list;
  return list.filter((a) => {
    const hay = [a?.filename, a?.url, a?.source, a?.map_id, a?.pack_catalog_id, a?.pack_label]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
}

/**
 * Insère une URL d'asset dans l'état ciblé d'un pack (transformation pure non-mutante).
 * Convertit le cas échéant `files` + `framesBase` en `srcs` absolus, dédoublonne,
 * garantit un `fps` ≥ 1, et supprime `files` au profit de `srcs`.
 * @param {Record<string, unknown> | null | undefined} prevPack
 * @param {string} targetState
 * @param {string} assetUrl
 * @returns {Record<string, unknown>}
 */
export function insertAssetUrlIntoPackState(prevPack, targetState, assetUrl) {
  const state = String(targetState || '').trim() || 'idle';
  const url = String(assetUrl || '').trim();
  const next = { ...(prevPack || {}) };
  if (!url) return next;
  const sf =
    next.stateFrames && typeof next.stateFrames === 'object' ? { ...next.stateFrames } : {};
  const cur = sf[state] && typeof sf[state] === 'object' ? { ...sf[state] } : {};
  let srcs = [];
  if (Array.isArray(cur.srcs) && cur.srcs.length > 0) {
    srcs = cur.srcs.map((u) => String(u || '').trim()).filter(Boolean);
  } else if (Array.isArray(cur.files) && cur.files.length > 0) {
    const base = String(next.framesBase || '').trim();
    const normalizedBase = base.endsWith('/') ? base : base ? `${base}/` : '';
    srcs = cur.files
      .map((f) => `${normalizedBase}${String(f || '').replace(/^\//, '')}`)
      .map((u) => String(u || '').trim())
      .filter(Boolean);
  }
  if (!srcs.includes(url)) srcs.push(url);
  sf[state] = {
    ...cur,
    srcs,
    fps: Math.max(1, Number(cur.fps) || 8),
  };
  delete sf[state].files;
  next.stateFrames = sf;
  return next;
}

/**
 * Instantané de l’éditeur (pack + libellé liste) pour détecter les modifications non enregistrées.
 * @param {Record<string, unknown> | null | undefined} pack
 * @param {string} label
 */
export function createMascotPackEditorSnapshot(pack, label) {
  const cleaned = sanitizeMascotPackDraft(pack || {});
  return {
    label: String(label || '').trim(),
    packJson: stringifyPack(cleaned, 0),
  };
}

/**
 * @param {{ label: string, packJson: string } | null | undefined} snapshot
 * @param {Record<string, unknown> | null | undefined} pack
 * @param {string} label
 */
export function isMascotPackEditorDirty(snapshot, pack, label) {
  if (!snapshot) return false;
  const current = createMascotPackEditorSnapshot(pack, label);
  return snapshot.label !== current.label || snapshot.packJson !== current.packJson;
}

/**
 * Insère une image dans l’état ciblé : fichier relatif si `framesBase` correspond, sinon URL absolue.
 * @param {Record<string, unknown> | null | undefined} prevPack
 * @param {string} targetState
 * @param {{ kind: 'pack-file' | 'map-file' | 'url', filename?: string, url: string, framesBaseHint?: string | null }} asset
 */
export function insertMascotImageIntoPackState(prevPack, targetState, asset) {
  const state = String(targetState || '').trim() || 'idle';
  const next = { ...(prevPack || {}) };
  const url = String(asset?.url || '').trim();
  if (!url) return next;

  const filename = String(asset?.filename || '').trim();
  const hint = String(asset?.framesBaseHint || '').trim();
  const framesBase = String(next.framesBase || '').trim();
  const norm = (b) => (b.endsWith('/') ? b : b ? `${b}/` : '');
  const canUseRelative =
    (asset?.kind === 'pack-file' || asset?.kind === 'map-file') &&
    filename &&
    hint &&
    framesBase &&
    norm(framesBase) === norm(hint);

  if (canUseRelative) {
    const sf =
      next.stateFrames && typeof next.stateFrames === 'object' ? { ...next.stateFrames } : {};
    next.stateFrames = appendFileToStateFrames(sf, state, filename);
    return next;
  }
  return insertAssetUrlIntoPackState(next, state, url);
}

const SOURCE_LABELS = {
  pack: 'Ce pack',
  map: 'Carte',
  site: 'Site',
};

/**
 * Fusionne pack, bibliothèque carte et assets globaux pour le panneau Images unifié.
 * @param {{
 *   packAssets?: Array<Record<string, unknown>>,
 *   libAssets?: Array<Record<string, unknown>>,
 *   globalAssets?: Array<Record<string, unknown>>,
 *   packUuid?: string | null,
 *   mapId?: string,
 *   sourceFilter?: 'all' | 'pack' | 'map' | 'site',
 *   search?: string,
 * }} opts
 */
export function buildUnifiedMascotImageEntries(opts = {}) {
  const packAssets = Array.isArray(opts.packAssets) ? opts.packAssets : [];
  const libAssets = Array.isArray(opts.libAssets) ? opts.libAssets : [];
  const globalAssets = Array.isArray(opts.globalAssets) ? opts.globalAssets : [];
  const packUuid = String(opts.packUuid || '').trim();
  const mapId = String(opts.mapId || '').trim();
  const sourceFilter = opts.sourceFilter || 'all';
  const packPrefix = serverMascotPackAssetsPrefix(packUuid);
  const mapPrefix = serverMascotSpriteLibraryAssetsPrefix(mapId);

  /** @type {Array<Record<string, unknown>>} */
  const entries = [];

  for (const a of packAssets) {
    const filename = String(a?.filename || '').trim();
    if (!filename) continue;
    entries.push({
      id: `pack:${filename}`,
      source: 'pack',
      sourceLabel: SOURCE_LABELS.pack,
      filename,
      url: String(a?.url || '').trim(),
      kind: 'pack-file',
      framesBaseHint: packPrefix,
      canDelete: true,
      deleteScope: 'pack',
    });
  }

  for (const a of libAssets) {
    const filename = String(a?.filename || '').trim();
    if (!filename) continue;
    entries.push({
      id: `map:${filename}`,
      source: 'map',
      sourceLabel: SOURCE_LABELS.map,
      filename,
      url: String(a?.url || '').trim(),
      kind: 'map-file',
      framesBaseHint: mapPrefix,
      canDelete: true,
      deleteScope: 'map',
    });
  }

  const seenUrls = new Set(entries.map((e) => e.url).filter(Boolean));
  for (const a of globalAssets) {
    const url = String(a?.url || '').trim();
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const siteSource = String(a?.source || 'site').trim() || 'site';
    entries.push({
      id: `site:${a?.id ?? url}`,
      source: 'site',
      sourceLabel: siteSource,
      filename: String(a?.filename || '').trim() || '—',
      url,
      kind: 'url',
      framesBaseHint: null,
      canDelete: false,
      meta: [a?.map_id, a?.pack_label].filter(Boolean).join(' · ') || '',
    });
  }

  let list = entries;
  if (sourceFilter !== 'all') {
    list = list.filter((e) => e.source === sourceFilter);
  }

  const q = String(opts.search || '')
    .trim()
    .toLowerCase();
  if (!q) return list;

  return list.filter((e) => {
    const hay = [e.filename, e.url, e.sourceLabel, e.meta, e.source]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
}
