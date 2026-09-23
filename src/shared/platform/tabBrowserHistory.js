/**
 * Historique navigateur des onglets du shell (ForetMap / GL).
 *
 * Chaque changement d’onglet initié par l’utilisateur empile une entrée ; le bouton
 * Retour (navigateur / smartphone) restaure l’onglet précédent — après les surcouches
 * (`overlayHistory`), avant de quitter l’application.
 */

export const TAB_HISTORY_STATE_KEY = 'foretmapShellTab';

/**
 * @param {unknown} state
 * @param {(id: string) => boolean} isKnownTab
 * @returns {string|null}
 */
export function readTabFromHistoryState(state, isKnownTab) {
  if (!state || typeof state !== 'object') return null;
  const raw = state[TAB_HISTORY_STATE_KEY];
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id || typeof isKnownTab !== 'function' || !isKnownTab(id)) return null;
  return id;
}

/**
 * @param {string} tab
 * @param {object|null|undefined} previousState
 * @returns {object}
 */
export function buildTabHistoryState(tab, previousState) {
  const base =
    previousState && typeof previousState === 'object' && !Array.isArray(previousState)
      ? { ...previousState }
      : {};
  // Une entrée d’onglet n’est pas une surcouche.
  delete base.foretmapOverlay;
  return { ...base, [TAB_HISTORY_STATE_KEY]: String(tab || '') };
}
