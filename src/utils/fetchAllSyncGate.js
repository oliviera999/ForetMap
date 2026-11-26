/**
 * Porte de polling différentiel de `fetchAll()` (audit charge serveur, piste 4).
 *
 * Le serveur expose `GET /api/sync-state` → `{ bootId, writes }` : identité du
 * process Node et compteur global d'écritures SQL. Si rien n'a été écrit depuis le
 * dernier cycle complet réussi DANS LE MÊME CONTEXTE CLIENT (même rôle, mêmes
 * défauts de carte…), le cycle de polling peut être sauté : 1 requête légère au
 * lieu de ~8 lourdes.
 *
 * Le **plan actif** n'entre plus dans la clé de contexte (lot perf 11/2026) : un
 * changement de plan ne doit forcer que le rechargement des domaines scopés carte
 * (zones, tâches, repères), pas le catalogue plantes ni les tutoriels.
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

/**
 * Domaines liés au plan actif : à recharger quand l'utilisateur change de carte,
 * même si `/api/sync-state` n'a pas bougé (les compteurs ne portent pas le map_id).
 */
export const MAP_SCOPED_SYNC_DOMAINS = Object.freeze(['zones', 'tasks', 'markers']);

/**
 * Domaines lourds / globaux : hors chemin critique du premier affichage post-connexion
 * (carte + tâches). Chargés juste après le déblocage du loader.
 */
export const DEFERRED_BOOT_SYNC_DOMAINS = Object.freeze(['plants', 'tutorials']);

/**
 * Clé de contexte **sans** plan actif : rôle, visite, droits tutoriels, défauts admin.
 * Sérialisation stable pour la porte différentielle.
 *
 * @param {object} params
 * @param {string|number|null} [params.studentId]
 * @param {boolean} [params.effectiveIsTeacher]
 * @param {boolean} [params.showPublicVisit]
 * @param {boolean} [params.canManageTutorials]
 * @param {string} [params.defaultMapStudent]
 * @param {string} [params.defaultMapTeacher]
 * @param {string} [params.defaultMapVisit]
 * @returns {string}
 */
export function buildFetchAllSyncContextKey({
  studentId = null,
  effectiveIsTeacher = false,
  showPublicVisit = false,
  canManageTutorials = false,
  defaultMapStudent = '',
  defaultMapTeacher = '',
  defaultMapVisit = '',
} = {}) {
  return JSON.stringify({
    studentId: studentId ?? null,
    effectiveIsTeacher: !!effectiveIsTeacher,
    showPublicVisit: !!showPublicVisit,
    canManageTutorials: !!canManageTutorials,
    defaultMapStudent: defaultMapStudent ?? '',
    defaultMapTeacher: defaultMapTeacher ?? '',
    defaultMapVisit: defaultMapVisit ?? '',
  });
}

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

/**
 * Domaines à recharger pour ce cycle, en tenant compte d'un changement de plan.
 *
 * @param {object} params
 * @param {{ key: string, bootId: string, writes: number, domains?: object }|null} params.prev
 * @param {{ bootId: string, writes: number, domains?: object }|null} params.next
 * @param {string} params.contextKey
 * @param {boolean} params.mapChanged — plan actif ≠ dernier plan hydraté avec succès
 * @param {boolean} [params.allowMapScopedWithoutBaseline] — déjà hydraté une fois : un
 *   changement de plan seul ne doit pas relancer plantes/tutoriels même sans baseline
 *   sync (fenêtre juste après connexion, avant la 2ᵉ sonde).
 * @returns {Set<string>|null} null = cycle complet
 */
export function resolveFetchDomainsForCycle({
  prev,
  next,
  contextKey,
  mapChanged,
  allowMapScopedWithoutBaseline = false,
}) {
  const changed = resolveChangedSyncDomains({ prev, next, contextKey });
  if (!mapChanged) return changed;
  if (changed === null) {
    // Sonde / baseline absente ou incomplète : si la coquille a déjà été peuplée,
    // borner au plan évite de re-télécharger ~350 Ko de plantes à chaque changement.
    if (allowMapScopedWithoutBaseline) return new Set(MAP_SCOPED_SYNC_DOMAINS);
    return null;
  }
  const out = new Set(changed);
  for (const domain of MAP_SCOPED_SYNC_DOMAINS) out.add(domain);
  return out;
}
