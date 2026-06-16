/**
 * Résolution des lignes de bulle mascotte (profils pack v2, réglages site, défauts code).
 */
import {
  DEFAULT_VISIT_MASCOT_DIALOG_PROFILE,
  normalizeDialogEventKey,
  sanitizeDialogLines,
  sanitizeDialogProfile,
  VISIT_MASCOT_DIALOG_EVENT,
  VISIT_MASCOT_DIALOG_EVENT_KEYS,
} from './visitMascotDialogEvents.js';
import { resolveVisitMascotEntry } from './visitMascotCatalog.js';

/**
 * @param {unknown} lines
 * @returns {boolean}
 */
function hasDialogLines(lines) {
  return Array.isArray(lines) && lines.length > 0;
}

/**
 * @param {Record<string, string[]>|null|undefined} profile
 * @param {string} eventKey
 * @returns {string[]|null}
 */
function pickProfileLines(profile, eventKey) {
  if (!profile || typeof profile !== 'object') return null;
  const lines = profile[eventKey];
  return hasDialogLines(lines) ? sanitizeDialogLines(lines) : null;
}

/**
 * Première liste non vide selon la priorité pack → catalogue → global → code.
 *
 * @param {string} eventKey
 * @param {{
 *   packProfile?: Record<string, string[]>|null,
 *   catalogProfile?: Record<string, string[]>|null,
 *   globalDefaults?: Record<string, string[]>|null,
 * }} layers
 * @returns {string[]}
 */
export function resolveDialogLinesForEvent(eventKey, layers = {}) {
  const stableKey = normalizeDialogEventKey(eventKey);
  const fromPack = pickProfileLines(layers.packProfile, stableKey);
  if (fromPack) return fromPack;
  const fromCatalog = pickProfileLines(layers.catalogProfile, stableKey);
  if (fromCatalog) return fromCatalog;
  const fromGlobal = pickProfileLines(layers.globalDefaults, stableKey);
  if (fromGlobal) return fromGlobal;
  const codeDefault = DEFAULT_VISIT_MASCOT_DIALOG_PROFILE[stableKey];
  if (hasDialogLines(codeDefault)) return [...codeDefault];
  const idleFallback = DEFAULT_VISIT_MASCOT_DIALOG_PROFILE[VISIT_MASCOT_DIALOG_EVENT.IDLE];
  if (hasDialogLines(idleFallback)) return [...idleFallback];
  return [];
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
export function pickRandomDialogLine(lines) {
  const list = sanitizeDialogLines(lines);
  if (list.length === 0) return '';
  const idx = Math.floor(Math.random() * list.length);
  return list[idx] || '';
}

/**
 * @param {string} mascotId
 * @param {unknown[]} extraCatalogEntries
 * @returns {Record<string, string[]>|null}
 */
export function getPackDialogProfile(mascotId, extraCatalogEntries = []) {
  const entry = resolveVisitMascotEntry(mascotId, extraCatalogEntries);
  const raw = entry?.dialogProfile;
  if (!raw || typeof raw !== 'object') return null;
  const cleaned = sanitizeDialogProfile(raw);
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

/**
 * @param {string} eventKey — clé stable ou legacy (move, mark_seen, …)
 * @param {{
 *   mascotId?: string,
 *   extraCatalogEntries?: unknown[],
 *   globalDefaults?: Record<string, string[]>|null,
 *   catalogOverrides?: Record<string, Record<string, string[]>>|null,
 * }} ctx
 * @returns {string}
 */
export function resolveMascotDialogLine(eventKey, ctx = {}) {
  const stableKey = normalizeDialogEventKey(eventKey);
  const mascotId = String(ctx.mascotId || '').trim();
  const extras = Array.isArray(ctx.extraCatalogEntries) ? ctx.extraCatalogEntries : [];
  const catalogOverrides =
    ctx.catalogOverrides && typeof ctx.catalogOverrides === 'object' ? ctx.catalogOverrides : null;
  const catalogProfile =
    mascotId && catalogOverrides?.[mascotId] ? catalogOverrides[mascotId] : null;
  const lines = resolveDialogLinesForEvent(stableKey, {
    packProfile: mascotId ? getPackDialogProfile(mascotId, extras) : null,
    catalogProfile,
    globalDefaults: ctx.globalDefaults,
  });
  return pickRandomDialogLine(lines);
}

/**
 * Profil effectif complet (toutes situations) pour aperçu studio.
 *
 * @param {{
 *   mascotId?: string,
 *   extraCatalogEntries?: unknown[],
 *   globalDefaults?: Record<string, string[]>|null,
 *   catalogOverrides?: Record<string, Record<string, string[]>>|null,
 * }} ctx
 * @returns {Record<string, string[]>}
 */
export function getEffectiveDialogProfile(ctx = {}) {
  const out = {};
  for (const key of VISIT_MASCOT_DIALOG_EVENT_KEYS) {
    const lines = resolveDialogLinesForEvent(key, {
      packProfile: ctx.mascotId
        ? getPackDialogProfile(ctx.mascotId, ctx.extraCatalogEntries || [])
        : null,
      catalogProfile:
        ctx.mascotId && ctx.catalogOverrides?.[ctx.mascotId]
          ? ctx.catalogOverrides[ctx.mascotId]
          : null,
      globalDefaults: ctx.globalDefaults,
    });
    if (lines.length > 0) out[key] = lines;
  }
  return out;
}

/**
 * Wrapper rétrocompatible : clé legacy ou stable, défauts code uniquement.
 *
 * @param {string} [eventKey]
 * @returns {string}
 */
export function pickMascotDialogFromDefaults(eventKey = 'idle') {
  const stable = normalizeDialogEventKey(eventKey);
  const lines = resolveDialogLinesForEvent(stable, {});
  return pickRandomDialogLine(lines);
}
