/**
 * Comportements personnalisés d'un pack mascotte visite : extraction (états & déclencheurs)
 * depuis une entrée catalogue résolue (`resolveVisitMascotEntry`).
 *
 * Les déclencheurs personnalisés (`customTriggers`) sont pilotés par les données du pack :
 * - `periodic` : joue un état toutes les `everyMs` (comportement ambiant) ;
 * - `tap` : joue un état au clic/tap sur la mascotte.
 * @see src/utils/mascotPack.js (schéma) · src/hooks/useAmbientMascotBehavior.js (moteur)
 */

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
