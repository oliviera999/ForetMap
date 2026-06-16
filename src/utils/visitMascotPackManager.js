import {
  serverMascotPackAssetsPrefix,
  serverMascotSpriteLibraryAssetsPrefix,
  MASCOT_PACK_FALLBACK_SILHOUETTES,
} from './mascotPackEditorModel.js';
import { validateMascotPackV1 } from './mascotPack.js';

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
