/**
 * Logique pure d'édition des frames/timeline d'un mascot pack WYSIWYG.
 * Manipulation d'URLs de frames, réordonnancement de la liste d'images avec
 * synchronisation des durées personnalisées (`frameDwellMs`), insertion d'un
 * fichier dans un état, et détection des fichiers référencés absents de la
 * médiathèque serveur. Aucune dépendance React.
 * @see src/utils/mascotPackEditorModel.js
 */

import { withAppBase } from '../services/api.js';
import {
  MASCOT_PACK_FALLBACK_SILHOUETTES,
  serverMascotPackAssetsPrefix,
} from './mascotPackEditorModel.js';

/**
 * Normalise un nom de fichier client en `.png` sûr.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeClientFilename(name) {
  const raw = String(name || '')
    .replace(/^.*[\\/]/, '')
    .trim();
  const base =
    raw
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .toLowerCase()
      .replace(/^-+|-+$/g, '') || 'frame';
  return base.toLowerCase().endsWith('.png') ? base : `${base}.png`;
}

/**
 * Ramène une référence frame (relative, absolue app ou URL) au nom de fichier attendu
 * dans `stateFrames.<état>.files` (ex. `cell-r0-c0.png`).
 * @param {string} ref
 * @param {string} [framesBase]
 * @returns {string}
 */
export function normalizePackFrameFileRef(ref, framesBase = '') {
  const s = String(ref || '').trim();
  if (!s || s.startsWith('blob:') || s.startsWith('data:') || /^https?:\/\//i.test(s)) {
    return s;
  }
  const normBase = String(framesBase || '').trim();
  const base = normBase.endsWith('/') ? normBase : normBase ? `${normBase}/` : '';
  if (base && s.startsWith(base)) {
    return s.slice(base.length).split('?')[0];
  }
  if (s.startsWith('/api/') || s.startsWith('/assets/')) {
    return s.split('/').pop()?.split('?')[0] || s;
  }
  return s.replace(/^\//, '');
}

/**
 * Normalise `stateFrames` : basenames dans `files`, conversion `srcs` locaux → `files`.
 * @param {Record<string, unknown>} pack
 * @returns {Record<string, unknown>}
 */
export function normalizePackStateFramesForFramesBase(pack) {
  if (!pack || typeof pack !== 'object') return pack;
  const framesBase = String(pack.framesBase || '').trim();
  const sf = pack.stateFrames;
  if (!sf || typeof sf !== 'object') return pack;
  const nextSf = {};
  for (const [state, spec] of Object.entries(sf)) {
    if (!spec || typeof spec !== 'object') {
      nextSf[state] = spec;
      continue;
    }
    const next = { ...spec };
    if (Array.isArray(next.files) && next.files.length > 0) {
      next.files = next.files.map((f) => normalizePackFrameFileRef(f, framesBase)).filter(Boolean);
    }
    const hasFileMode = Object.prototype.hasOwnProperty.call(next, 'files');
    const hasSrcMode = Object.prototype.hasOwnProperty.call(next, 'srcs');
    if (Array.isArray(next.srcs) && next.srcs.length > 0 && framesBase) {
      const normBase = framesBase.endsWith('/') ? framesBase : `${framesBase}/`;
      const srcs = next.srcs.map((u) => String(u || '').trim()).filter(Boolean);
      const allLocal = srcs.every(
        (u) =>
          u.startsWith(normBase) || u.startsWith('/assets/mascots/') || u.startsWith('/api/visit/'),
      );
      const filesEmpty = !Array.isArray(next.files) || next.files.length === 0;
      if (allLocal && filesEmpty) {
        next.files = srcs.map((u) => normalizePackFrameFileRef(u, framesBase)).filter(Boolean);
        delete next.srcs;
      }
    }
    if (hasSrcMode && !hasFileMode && Array.isArray(next.srcs)) {
      // conserve srcs externes (blob, http)
    }
    nextSf[state] = next;
  }
  return { ...pack, stateFrames: nextSf };
}

/**
 * Liste les noms de fichiers `.png` référencés (mode `files`) dans un pack.
 * @param {Record<string, unknown> | null | undefined} pack
 * @returns {string[]}
 */
export function collectPackReferencedFrameFilenames(pack) {
  const sf = pack?.stateFrames && typeof pack.stateFrames === 'object' ? pack.stateFrames : {};
  const out = new Set();
  for (const spec of Object.values(sf)) {
    if (!spec || typeof spec !== 'object') continue;
    const files = Array.isArray(spec.files) ? spec.files : [];
    for (const file of files) {
      const name = normalizePackFrameFileRef(file, String(pack?.framesBase || ''));
      if (name && name.toLowerCase().endsWith('.png')) out.add(name);
    }
  }
  return [...out];
}

/**
 * Résout l'URL d'une frame relative au `framesBase` du pack.
 * @param {Record<string, unknown>} pack
 * @param {string} rel
 * @param {{ assetPreviewByFilename?: Record<string, string> }} [opts]
 * @returns {string}
 */
export function resolveFrameUrl(pack, rel, opts = {}) {
  const s = String(rel || '').trim();
  if (!s) return '';
  if (s.startsWith('blob:') || s.startsWith('http://') || s.startsWith('https://')) return s;
  const framesBase = String(pack?.framesBase || '').trim();
  if (s.startsWith('/api/') || s.startsWith('/assets/')) {
    const basename = s.split('/').pop()?.split('?')[0] || '';
    const preview = basename ? opts.assetPreviewByFilename?.[basename] : '';
    return withAppBase(preview || s);
  }
  const filename = normalizePackFrameFileRef(s, framesBase);
  const preview = opts.assetPreviewByFilename?.[filename];
  if (preview) return withAppBase(preview);
  let base = framesBase;
  if (!base.endsWith('/')) base = `${base}/`;
  return withAppBase(`${base}${filename}`);
}

/**
 * Résout l'URL d'aperçu d'un `src` absolu (laisse passer data/blob/http).
 * @param {string} raw
 * @param {{ assetPreviewByFilename?: Record<string, string> }} [opts]
 * @returns {string}
 */
export function resolveSrcPreviewUrl(raw, opts = {}) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (
    s.startsWith('blob:') ||
    s.startsWith('data:') ||
    s.startsWith('http://') ||
    s.startsWith('https://')
  )
    return s;
  const basename = s.split('/').pop()?.split('?')[0] || '';
  const preview = basename ? opts.assetPreviewByFilename?.[basename] : '';
  if (preview) return withAppBase(preview);
  return withAppBase(s);
}

/**
 * Échange deux frames d'un état et synchronise `frameDwellMs` si présent et
 * de longueur cohérente. Renvoie un nouveau `spec` (non-mutant), `fps` garanti.
 * @param {Record<string, unknown>} spec
 * @param {string[]} files
 * @param {number[]} dwell
 * @param {number} fps
 * @param {number} from
 * @param {number} to
 * @returns {Record<string, unknown>}
 */
export function swapFrames(spec, files, dwell, fps, from, to) {
  const nextFiles = [...files];
  [nextFiles[from], nextFiles[to]] = [nextFiles[to], nextFiles[from]];
  let nextDwell;
  if (dwell.length === files.length) {
    const d = [...dwell];
    [d[from], d[to]] = [d[to], d[from]];
    nextDwell = d;
  }
  return {
    ...spec,
    files: nextFiles,
    fps,
    ...(nextDwell ? { frameDwellMs: nextDwell } : {}),
  };
}

/**
 * Retire la frame à l'index donné et synchronise `frameDwellMs` si cohérent.
 * @param {Record<string, unknown>} spec
 * @param {string[]} files
 * @param {number[]} dwell
 * @param {number} fps
 * @param {number} idx
 * @returns {Record<string, unknown>}
 */
export function removeFrameAt(spec, files, dwell, fps, idx) {
  const nextFiles = files.filter((_, i) => i !== idx);
  let nextDwell = dwell;
  if (dwell.length === files.length) {
    nextDwell = dwell.filter((_, i) => i !== idx);
  }
  return {
    ...spec,
    files: nextFiles,
    fps,
    ...(nextDwell.length ? { frameDwellMs: nextDwell } : {}),
  };
}

/**
 * Insère un fichier (non dupliqué) dans l'état ciblé d'un dictionnaire
 * `stateFrames`. Bascule en mode `files` (supprime `srcs`). Non-mutant.
 * @param {Record<string, unknown>} stateFrames
 * @param {string} stateKey
 * @param {string} filename
 * @returns {Record<string, unknown>} nouveau dictionnaire `stateFrames`
 */
export function appendFileToStateFrames(stateFrames, stateKey, filename) {
  const map =
    stateFrames && typeof stateFrames === 'object' && !Array.isArray(stateFrames)
      ? stateFrames
      : {};
  const cur = map[stateKey];
  const base = cur && typeof cur === 'object' ? { ...cur } : { fps: 8 };
  const files = Array.isArray(base.files) ? [...base.files] : [];
  if (files.includes(filename)) return { ...map };
  files.push(filename);
  const nextSpec = { ...base, files };
  delete nextSpec.srcs;
  return { ...map, [stateKey]: nextSpec };
}

/**
 * Calcule les avertissements non bloquants d'un pack en édition :
 * silhouette inconnue, et fichiers référencés absents de la médiathèque
 * serveur (uniquement si `framesBase` pointe vers le dossier serveur du pack).
 * @param {Record<string, unknown> | null | undefined} pack
 * @param {string | null | undefined} packUuid
 * @param {Array<Record<string, unknown>>} assets
 * @param {Record<string, unknown>} stateFrames
 * @returns {string[]}
 */
export function computePackMediaWarnings(pack, packUuid, assets, stateFrames) {
  const warnings = [];
  const silhouette = String(pack?.fallbackSilhouette || '').trim();
  if (silhouette && !MASCOT_PACK_FALLBACK_SILHOUETTES.includes(silhouette)) {
    warnings.push(`Silhouette « ${silhouette} » inconnue: un fallback par défaut sera utilisé.`);
  }
  const prefix = serverMascotPackAssetsPrefix(packUuid);
  const base = String(pack?.framesBase || '').trim();
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  if (prefix && normalizedBase.startsWith(prefix)) {
    const available = new Set(
      (Array.isArray(assets) ? assets : [])
        .map((a) => String(a?.filename || '').trim())
        .filter(Boolean),
    );
    const referenced = new Set();
    for (const spec of Object.values(stateFrames || {})) {
      if (!spec || typeof spec !== 'object') continue;
      const files = Array.isArray(spec.files) ? spec.files : [];
      for (const file of files) {
        const name = normalizePackFrameFileRef(file, normalizedBase);
        if (name && name.toLowerCase().endsWith('.png')) referenced.add(name);
      }
    }
    const missing = [...referenced].filter((f) => !available.has(f));
    if (missing.length > 0) {
      warnings.push(
        `Fichiers référencés absents de la médiathèque serveur: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}.`,
      );
    }
  }
  return warnings;
}
