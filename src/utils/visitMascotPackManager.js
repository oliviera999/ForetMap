import {
  serverMascotPackAssetsPrefix,
  serverMascotSpriteLibraryAssetsPrefix,
  MASCOT_PACK_FALLBACK_SILHOUETTES,
  parsePackJson,
  stringifyPack,
} from './mascotPackEditorModel.js';
import { validateMascotPackV1 } from './mascotPack.js';
import {
  appendFileToStateFrames,
  collectPackReferencedFrameFilenames,
  normalizePackStateFramesForFramesBase,
} from './mascotPackEditorFrames.js';
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
 * Détecte un JSON brouillon non appliqué par rapport au pack éditeur courant.
 * @param {string} jsonDraft
 * @param {Record<string, unknown> | null | undefined} editorPack
 */
export function isJsonDraftDirty(jsonDraft, editorPack) {
  const parsed = parsePackJson(jsonDraft);
  if (!parsed.ok) return String(jsonDraft || '').trim().length > 0;
  const draftJson = stringifyPack(sanitizeMascotPackDraft(parsed.pack), 0);
  const currentJson = stringifyPack(sanitizeMascotPackDraft(editorPack || {}), 0);
  return draftJson !== currentJson;
}

/**
 * ID mascotte catalogue pour l’héritage des dialogues (modèle source, pas srv-{uuid}).
 * @param {Record<string, unknown> | null | undefined} editorPack
 * @param {Record<string, unknown> | null | undefined} selectedRow
 */
export function resolvePackDialogMascotId(editorPack, selectedRow) {
  const cloned = String(editorPack?.clonedFromCatalogId || '').trim();
  if (cloned) return cloned;
  const catalogId = String(selectedRow?.catalog_id || editorPack?.id || '').trim();
  if (catalogId && !catalogId.startsWith('srv-')) return catalogId;
  return '';
}

/**
 * Packs serveur clonés depuis un modèle catalogue intégré.
 * @param {Array<Record<string, unknown>>} packs
 * @param {string} modelId
 */
export function findPacksForCatalogModel(packs, modelId) {
  const mid = String(modelId || '').trim();
  if (!mid) return [];
  return (Array.isArray(packs) ? packs : []).filter(
    (p) => String(p?.pack?.clonedFromCatalogId || '').trim() === mid,
  );
}

/**
 * Choisit la copie catalogue à ouvrir (pack sélectionné, unique, ou la plus récente).
 * @param {Array<Record<string, unknown>>} copies
 * @param {string | null | undefined} selectedId
 * @returns {{ pack: Record<string, unknown>, ambiguous: boolean } | null}
 */
export function pickPreferredCatalogModelPack(copies, selectedId) {
  const list = Array.isArray(copies) ? copies : [];
  if (list.length === 0) return null;
  const sel = String(selectedId || '').trim();
  const selectedMatch = sel ? list.find((p) => String(p?.id || '') === sel) : null;
  if (selectedMatch) {
    return { pack: selectedMatch, ambiguous: list.length > 1 };
  }
  if (list.length === 1) return { pack: list[0], ambiguous: false };
  const sorted = [...list].sort((a, b) => {
    const ta = String(a?.updated_at || a?.created_at || '').trim();
    const tb = String(b?.updated_at || b?.created_at || '').trim();
    return tb.localeCompare(ta);
  });
  return { pack: sorted[0], ambiguous: true };
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
  public: 'Site',
  library: 'Carte',
};

/**
 * @param {Record<string, unknown>} asset
 * @param {string} packUuid
 * @param {string} mapId
 */
function resolveGlobalAssetDeleteMeta(asset, packUuid, mapId) {
  const apiSource = String(asset?.source || 'public').trim() || 'public';
  const url = String(asset?.url || '').trim();
  const filename = String(asset?.filename || '').trim();
  const assetPackId = String(asset?.pack_id || '').trim();
  const assetMapId = String(asset?.map_id || '').trim();

  if (apiSource === 'public') {
    return {
      canDelete: true,
      deleteScope: 'public',
      deleteUrl: url,
    };
  }
  if (apiSource === 'pack' && assetPackId && assetPackId === packUuid && filename) {
    return { canDelete: true, deleteScope: 'pack', deleteUrl: null };
  }
  if (apiSource === 'library' && assetMapId && assetMapId === mapId && filename) {
    return { canDelete: true, deleteScope: 'map', deleteUrl: null };
  }
  const foreignHint =
    apiSource === 'pack'
      ? `Pack « ${asset?.pack_label || assetPackId || '?'} » (${asset?.map_id || '?'})`
      : apiSource === 'library'
        ? `Bibliothèque carte « ${assetMapId || '?'} »`
        : '';
  return {
    canDelete: false,
    deleteScope: null,
    deleteUrl: null,
    metaExtra: foreignHint,
  };
}

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
      apiSource: 'pack',
      sourceLabel: SOURCE_LABELS.pack,
      filename,
      url: String(a?.url || '').trim(),
      previewUrl: String(a?.preview_url || a?.url || '').trim(),
      kind: 'pack-file',
      framesBaseHint: packPrefix,
      canDelete: true,
      deleteScope: 'pack',
      deleteUrl: null,
    });
  }

  for (const a of libAssets) {
    const filename = String(a?.filename || '').trim();
    if (!filename) continue;
    entries.push({
      id: `map:${filename}`,
      source: 'map',
      apiSource: 'library',
      sourceLabel: SOURCE_LABELS.map,
      filename,
      url: String(a?.url || '').trim(),
      kind: 'map-file',
      framesBaseHint: mapPrefix,
      canDelete: true,
      deleteScope: 'map',
      deleteUrl: null,
    });
  }

  const searchQuery = String(opts.search || '').trim();
  const globalAssetsForEntries = searchQuery
    ? filterGlobalAssets(globalAssets, searchQuery)
    : globalAssets;

  const seenUrls = new Set(entries.map((e) => e.url).filter(Boolean));
  for (const a of globalAssetsForEntries) {
    const url = String(a?.url || '').trim();
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const apiSource = String(a?.source || 'public').trim() || 'public';
    const deleteMeta = resolveGlobalAssetDeleteMeta(a, packUuid, mapId);
    const metaParts = [a?.map_id, a?.pack_label, deleteMeta.metaExtra].filter(Boolean);
    entries.push({
      id: `global:${a?.id ?? url}`,
      source: apiSource === 'public' ? 'site' : apiSource === 'library' ? 'map' : 'pack',
      apiSource,
      sourceLabel: SOURCE_LABELS[apiSource] || apiSource,
      filename: String(a?.filename || '').trim() || '—',
      url,
      kind: 'url',
      framesBaseHint: null,
      canDelete: deleteMeta.canDelete,
      deleteScope: deleteMeta.deleteScope,
      deleteUrl: deleteMeta.deleteUrl,
      packId: String(a?.pack_id || '').trim() || null,
      mapIdRef: String(a?.map_id || '').trim() || null,
      meta: metaParts.join(' · ') || '',
    });
  }

  let list = entries;
  if (sourceFilter === 'site') {
    list = list.filter((e) => e.apiSource === 'public');
  } else if (sourceFilter !== 'all') {
    list = list.filter((e) => e.source === sourceFilter);
  }

  const q = String(opts.search || '')
    .trim()
    .toLowerCase();
  if (!q) return list;

  return list.filter((e) => {
    const hay = [e.filename, e.url, e.sourceLabel, e.meta, e.source, e.apiSource]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });
}

/**
 * Mappe filename → preview_url signée (studio, packs brouillon).
 * @param {Array<Record<string, unknown>> | null | undefined} packAssets
 * @returns {Record<string, string>}
 */
export function buildPackAssetPreviewByFilename(packAssets) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const asset of Array.isArray(packAssets) ? packAssets : []) {
    const filename = String(asset?.filename || '').trim();
    const previewUrl = String(asset?.preview_url || '').trim();
    if (filename && previewUrl) map[filename] = previewUrl;
  }
  return map;
}

/**
 * Réécrit les `srcs` d’un `spriteCut` avec les URLs signées du studio.
 * @param {Record<string, unknown> | null | undefined} spriteCut
 * @param {Record<string, string>} previewByFilename
 * @param {string} [packFramesBase]
 * @returns {Record<string, unknown> | null | undefined}
 */
export function applyPackAssetPreviewUrlsToSpriteCut(spriteCut, previewByFilename, packFramesBase) {
  if (!spriteCut || typeof spriteCut !== 'object') return spriteCut;
  const map = previewByFilename && typeof previewByFilename === 'object' ? previewByFilename : {};
  if (!Object.keys(map).length) return spriteCut;

  const base = String(packFramesBase || '').trim();
  const normalizedBase = base.endsWith('/') ? base : base ? `${base}/` : '';

  const rewriteUrl = (rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (!url) return url;
    if (normalizedBase && url.startsWith(normalizedBase)) {
      const filename = url.slice(normalizedBase.length).split('?')[0];
      if (filename && map[filename]) return map[filename];
    }
    const basename = url.split('/').pop()?.split('?')[0] || '';
    if (basename && map[basename]) return map[basename];
    return url;
  };

  const stateFrames = spriteCut.stateFrames;
  if (!stateFrames || typeof stateFrames !== 'object') return spriteCut;

  const nextStateFrames = {};
  for (const [state, spec] of Object.entries(stateFrames)) {
    if (!spec || typeof spec !== 'object') {
      nextStateFrames[state] = spec;
      continue;
    }
    const srcs = Array.isArray(spec.srcs)
      ? spec.srcs.map((u) => rewriteUrl(String(u || '')))
      : spec.srcs;
    nextStateFrames[state] = { ...spec, ...(Array.isArray(srcs) ? { srcs } : {}) };
  }
  return { ...spriteCut, stateFrames: nextStateFrames };
}

const CATALOG_STATIC_FRAMES_BASE = {
  gnome1: '/assets/mascots/gnome1/frames/',
  'renard2-cut-spritesheet': '/assets/mascots/renard2-cut/frames/',
  'fox-backpack-spritesheet': '/assets/mascots/fox-backpack/cells/',
};

/**
 * Préfixe statique des frames catalogue (si connu).
 * @param {string} catalogId
 * @returns {string | null}
 */
export function resolveCatalogStaticFramesBase(catalogId) {
  const id = String(catalogId || '').trim();
  return CATALOG_STATIC_FRAMES_BASE[id] || null;
}

/**
 * Fichiers référencés par le pack mais absents de la médiathèque serveur.
 * @param {Record<string, unknown> | null | undefined} pack
 * @param {Array<Record<string, unknown>> | null | undefined} packAssets
 */
export function listMissingPackFrameFilenames(pack, packAssets) {
  const normalized = normalizePackStateFramesForFramesBase(pack || {});
  const referenced = collectPackReferencedFrameFilenames(normalized);
  const available = new Set(
    (Array.isArray(packAssets) ? packAssets : [])
      .map((a) => String(a?.filename || '').trim())
      .filter(Boolean),
  );
  return referenced.filter((filename) => !available.has(filename));
}
