/**
 * Comportements personnalisés d'un pack mascotte visite : extraction (états & déclencheurs)
 * depuis une entrée catalogue résolue (`resolveVisitMascotEntry`).
 *
 * Les déclencheurs personnalisés (`customTriggers`) sont pilotés par les données du pack :
 * - `periodic` : joue un état toutes les `everyMs` (comportement ambiant) ;
 * - `tap` : joue un état au clic/tap sur la mascotte.
 * @see src/utils/mascotPack.js (schéma) · src/hooks/useAmbientMascotBehavior.js (moteur)
 */
import { sanitizeDialogLines } from './visitMascotDialogEvents.js';

/** @param {object|null} entry Entrée catalogue (peut porter `customStates` / `spriteCut`). */
export function getEntryCustomStates(entry) {
  const fromEntry = Array.isArray(entry?.customStates) ? entry.customStates : null;
  const fromSprite = Array.isArray(entry?.spriteCut?.customStates)
    ? entry.spriteCut.customStates
    : null;
  return fromEntry || fromSprite || [];
}

/** Clés d'états personnalisés (pour `resolveVisitMascotState({ extraStates })`). */
export function getEntryCustomStateKeys(entry) {
  return getEntryCustomStates(entry)
    .map((s) => String(s?.key || '').trim())
    .filter(Boolean);
}

/** @param {object|null} entry */
export function getEntryCustomTriggers(entry) {
  const fromEntry = Array.isArray(entry?.customTriggers) ? entry.customTriggers : null;
  const fromSprite = Array.isArray(entry?.spriteCut?.customTriggers)
    ? entry.spriteCut.customTriggers
    : null;
  return fromEntry || fromSprite || [];
}

/** Déclencheurs périodiques valides (everyMs ≥ 1000). */
export function getPeriodicTriggers(entry) {
  return getEntryCustomTriggers(entry).filter(
    (t) => t && t.type === 'periodic' && Number(t.everyMs) >= 1000 && t.state,
  );
}

/** Déclencheurs au tap valides. */
export function getTapTriggers(entry) {
  return getEntryCustomTriggers(entry).filter((t) => t && t.type === 'tap' && t.state);
}

/**
 * Lignes de bulle d'un déclencheur personnalisé. Priorité : profil de dialogue
 * central du pack (`dialogProfile[trigger.key]`) → bulles inline du déclencheur
 * (`trigger.dialog`). Permet d'éditer la bulle au studio dialogue.
 * @param {object|null} entry
 * @param {object} trigger
 * @returns {string[]}
 */
export function resolveTriggerDialogLines(entry, trigger) {
  const key = String(trigger?.key || '').trim();
  const fromProfile =
    key && entry?.dialogProfile && typeof entry.dialogProfile === 'object'
      ? entry.dialogProfile[key]
      : null;
  const central = sanitizeDialogLines(fromProfile);
  if (central.length) return central;
  return sanitizeDialogLines(trigger?.dialog);
}

/**
 * Signature stable des déclencheurs périodiques (pour mémoïsation / deps d'effet).
 * @returns {string}
 */
export function periodicTriggersSignature(triggers) {
  const list = Array.isArray(triggers) ? triggers : [];
  return JSON.stringify(
    list.map((t) => [
      String(t?.key || ''),
      String(t?.state || ''),
      Number(t?.durationMs) || 0,
      Number(t?.everyMs) || 0,
    ]),
  );
}
