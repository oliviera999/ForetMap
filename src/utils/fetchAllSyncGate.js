/**
 * Porte de polling différentiel de `fetchAll()` (audit charge serveur, piste 4).
 *
 * Le serveur expose `GET /api/sync-state` → `{ bootId, writes }` : identité du
 * process Node et compteur global d'écritures SQL. Si rien n'a été écrit depuis le
 * dernier cycle complet réussi DANS LE MÊME CONTEXTE CLIENT (même carte, même rôle…),
 * le cycle de polling peut être sauté : 1 requête légère au lieu de ~8 lourdes.
 *
 * Garde-fous :
 * - toute erreur / réponse invalide de la sonde → cycle complet (comportement
 *   historique) ;
 * - un redémarrage serveur (bootId différent) → cycle complet ;
 * - un plafond de sauts consécutifs force un cycle complet périodique, pour couvrir
 *   les écritures que le compteur ne voit pas (scripts CLI, SQL hors process).
 */

/** Avec un polling à 60–120 s, 10 sauts ≈ 10–20 min de fraîcheur maximum garantie. */
export const MAX_CONSECUTIVE_SYNC_SKIPS = 10;

/** Réponse de sonde exploitable : bootId non vide + compteur numérique fini. */
export function isValidSyncState(state) {
  return (
    !!state &&
    typeof state.bootId === 'string' &&
    state.bootId.length > 0 &&
    Number.isFinite(state.writes)
  );
}

/**
 * @param {{ key: string, bootId: string, writes: number }|null} prev — sync-state
 *   mémorisé au dernier cycle complet réussi (`key` = contexte client sérialisé)
 * @param {{ bootId: string, writes: number }|null} next — sonde du cycle courant
 * @param {string} contextKey — contexte client sérialisé du cycle courant
 * @param {number} consecutiveSkips — sauts déjà enchaînés depuis le dernier cycle complet
 * @returns {boolean} true si le cycle de refetch peut être sauté sans perte de fraîcheur
 */
export function canSkipFetchAllCycle({ prev, next, contextKey, consecutiveSkips }) {
  if (!prev || !isValidSyncState(next)) return false;
  if (consecutiveSkips >= MAX_CONSECUTIVE_SYNC_SKIPS) return false;
  if (prev.key !== contextKey) return false;
  if (prev.bootId !== next.bootId) return false;
  return prev.writes === next.writes;
}
