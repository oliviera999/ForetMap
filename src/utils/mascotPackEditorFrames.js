/**
 * Logique pure d'édition des frames/timeline d'un mascot pack WYSIWYG.
 * Manipulation d'URLs de frames, réordonnancement de la liste d'images avec
 * synchronisation des durées personnalisées (`frameDwellMs`), insertion d'un
 * fichier dans un état, et détection des fichiers référencés absents de la
 * médiathèque serveur. Aucune dépendance React.
 * @see src/utils/mascotPackEditorModel.js
 */

import { withAppBase } from '../services/api';
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
  const raw = String(name || '').replace(/^.*[\\/]/, '').trim();
  const base = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'frame';
  return base.toLowerCase().endsWith('.png') ? base : `${base}.png`;
}

/**
 * Résout l'URL d'une frame relative au `framesBase` du pack.
 * @param {Record<string, unknown>} pack
 * @param {string} rel
 * @returns {string}
 */
export function resolveFrameUrl(pack, rel) {
  const s = String(rel || '').trim();
  if (!s) return '';
  if (s.startsWith('blob:') || s.startsWith('http://') || s.startsWith('https://')) return s;
  let base = String(pack?.framesBase || '').trim();
  if (!base.endsWith('/')) base = `${base}/`;
  return withAppBase(`${base}${s.replace(/^\//, '')}`);
}

/**
 * Résout l'URL d'aperçu d'un `src` absolu (laisse passer data/blob/http).
 * @param {string} raw
 * @returns {string}
 */
export function resolveSrcPreviewUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('blob:') || s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) return s;
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
  const map = stateFrames && typeof stateFrames === 'object' && !Array.isArray(stateFrames)
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
        const name = String(file || '').trim();
        if (name) referenced.add(name);
      }
    }
    const missing = [...referenced].filter((f) => !available.has(f));
    if (missing.length > 0) {
      warnings.push(`Fichiers référencés absents de la médiathèque serveur: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}.`);
    }
  }
  return warnings;
}
