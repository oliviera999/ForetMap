/**
 * Résolution des réactions mascotte (transient / happy) à partir du profil pack v2
 * ou des valeurs par défaut (comportement historique).
 */
import {
  DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE,
  VISIT_MASCOT_INTERACTION_EVENT,
} from './visitMascotInteractionEvents.js';
import { resolveVisitMascotEntry } from './visitMascotCatalog.js';

/**
 * @param {unknown} profile
 * @returns {Record<string, { mode: string, state?: string, durationMs?: number }>}
 */
function mergeInteractionProfile(profile) {
  const base = { ...DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE };
  if (!profile || typeof profile !== 'object') return base;
  for (const [k, v] of Object.entries(profile)) {
    if (v && typeof v === 'object' && typeof v.mode === 'string') {
      base[k] = {
        mode: v.mode,
        ...(v.state ? { state: String(v.state) } : {}),
        ...(v.durationMs != null ? { durationMs: Number(v.durationMs) } : {}),
      };
    }
  }
  return base;
}

/**
 * @param {string} mascotId
 * @param {Array<unknown>} extraCatalogEntries
 * @returns {Record<string, { mode: string, state?: string, durationMs?: number }>}
 */
export function getResolvedVisitMascotInteractionProfile(mascotId, extraCatalogEntries = []) {
  const entry = resolveVisitMascotEntry(mascotId, extraCatalogEntries);
  const raw = entry?.interactionProfile;
  return mergeInteractionProfile(raw);
}

/**
 * @param {string} eventKey — une valeur de VISIT_MASCOT_INTERACTION_EVENT
 * @param {{ mascotId: string, extraCatalogEntries?: unknown[] }} ctx
 * @returns {{ kind: 'transient', state: string, durationMs: number } | { kind: 'happy' } | { kind: 'none' }}
 */
export function resolveVisitMascotInteraction(eventKey, ctx) {
  const profile = getResolvedVisitMascotInteractionProfile(ctx.mascotId, ctx.extraCatalogEntries || []);
  const rule = profile[eventKey] || DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE[eventKey];
  if (!rule || rule.mode === 'none') return { kind: 'none' };
  if (rule.mode === 'happy') return { kind: 'happy' };
  if (rule.mode === 'transient' && rule.state) {
    const durationMs = Math.max(300, Number(rule.durationMs) || 1500);
    return { kind: 'transient', state: String(rule.state), durationMs };
  }
  return { kind: 'none' };
}

export { VISIT_MASCOT_INTERACTION_EVENT };
