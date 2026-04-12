/**
 * Aide à l’édition WYSIWYG des mascot packs v1 (hors validation Zod).
 * @see src/utils/mascotPack.js
 */

/** Silhouettes acceptées par VisitMascotFallbackSvg (liste UI). */
export const MASCOT_PACK_FALLBACK_SILHOUETTES = [
  'gnome',
  'sprout',
  'scrap',
  'olu',
  'tanBird',
  'backpackFox',
  'backpackFox2',
  'spore',
  'vine',
  'moss',
  'seed',
  'swarm',
];

/**
 * @param {string} packUuid
 * @returns {string | null} préfixe `framesBase` pour les fichiers uploadés serveur
 */
export function serverMascotPackAssetsPrefix(packUuid) {
  const id = String(packUuid || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  let b = `/api/visit/mascot-packs/${id}/assets/`;
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

/**
 * Force `framesBase` vers le dossier API du pack (si uuid valide).
 * @param {Record<string, unknown>} pack
 * @param {string} packUuid
 */
export function ensureServerFramesBase(pack, packUuid) {
  if (!pack || typeof pack !== 'object') return pack;
  const prefix = serverMascotPackAssetsPrefix(packUuid);
  if (!prefix) return { ...pack };
  return { ...pack, framesBase: prefix };
}

/**
 * @param {string} str
 * @returns {{ ok: true, pack: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parsePackJson(str) {
  try {
    const raw = String(str ?? '').trim();
    if (!raw) return { ok: false, error: 'JSON vide.' };
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      return { ok: false, error: 'Le document doit être un objet JSON.' };
    }
    return { ok: true, pack: /** @type {Record<string, unknown>} */ (o) };
  } catch (e) {
    return { ok: false, error: e?.message || 'JSON invalide.' };
  }
}

/**
 * @param {unknown} pack
 * @param {number} [space]
 */
export function stringifyPack(pack, space = 2) {
  return JSON.stringify(pack, null, space);
}

/** Copie profonde simple (JSON) pour isoler l’éditeur. */
export function clonePackDeep(pack) {
  const parsed = parsePackJson(stringifyPack(pack, 0));
  return parsed.ok ? parsed.pack : {};
}
