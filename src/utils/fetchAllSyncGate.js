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

/** Domaines du cycle fetchAll (alignés sur les compteurs serveur de /api/sync-state). */
export const ALL_SYNC_DOMAINS = [
  'maps',
  'zones',
  'tasks',
  'plants',
  'markers',
  'tutorials',
  'authMe',
];

function isValidDomainMap(domains) {
  if (!domains || typeof domains !== 'object') return false;
  return ALL_SYNC_DOMAINS.every((domain) => Number.isFinite(domains[domain]));
}

/**
 * Refetch ciblé : ensemble des domaines dont le compteur serveur a bougé depuis la
 * baseline. Retourne `null` (= tout refetcher) dès qu'une information manque ou ne
 * peut pas être comparée : pas de baseline, sonde invalide, contexte client différent,
 * redémarrage serveur, compteurs par domaine absents d'un côté (serveur plus ancien).
 *
 * @returns {Set<string>|null} domaines à refetcher, ou null pour un cycle complet
 */
export function resolveChangedSyncDomains({ prev, next, contextKey }) {
  if (!prev || !isValidSyncState(next)) return null;
  if (prev.key !== contextKey) return null;
  if (prev.bootId !== next.bootId) return null;
  if (!isValidDomainMap(prev.domains) || !isValidDomainMap(next.domains)) return null;
  const changed = new Set();
  for (const domain of ALL_SYNC_DOMAINS) {
    if (prev.domains[domain] !== next.domains[domain]) changed.add(domain);
  }
  return changed;
}
