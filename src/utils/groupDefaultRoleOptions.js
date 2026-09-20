/**
 * Profils proposables comme « profil par défaut d'un groupe ».
 *
 * Extrait de `groups-views.jsx` pour être testable sans monter la vue : les deux régressions
 * corrigées ici sont invisibles au montage (une liste vide ressemble à une liste pas encore
 * chargée) et méritaient leur propre filet.
 */

/**
 * `GET /api/rbac/profiles` répond `{ roles: [...] }`, pas un tableau nu.
 * Le sélecteur des groupes testait `Array.isArray(payload)` seul : il obtenait donc toujours
 * une liste vide, et aucun profil n'était attribuable à un groupe.
 *
 * @param {unknown} payload réponse de l'API (ou `null` si le chargement a échoué)
 * @returns {Array<object>}
 */
export function normalizeProfilesPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.roles)) return payload.roles;
  return [];
}

/**
 * Profils proposables comme profil par défaut d'un groupe : **tous** les profils ForetMap,
 * sauf ceux du jeu Gnomes & Licornes. Le serveur publie `group_default_allowed` par profil
 * pour l'acteur courant (hors administrateur, pas de profil de rang supérieur au sien) : on le
 * suit dès qu'il est présent (`lib/groupDefaultRolePolicy.js`).
 *
 * @param {Array<object>} roles
 * @returns {Array<object>}
 */
export function filterGroupDefaultRoles(roles) {
  return (Array.isArray(roles) ? roles : [])
    .filter((r) => {
      if (typeof r?.group_default_allowed === 'boolean') return r.group_default_allowed;
      return !String(r?.slug || '')
        .toLowerCase()
        .startsWith('gl_');
    })
    .sort((a, b) => Number(b?.rank || 0) - Number(a?.rank || 0));
}
