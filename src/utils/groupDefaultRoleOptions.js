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
 * Filtre aligné sur la règle serveur (`isAllowedGroupDefaultRole`).
 *
 * Le serveur publie `group_default_allowed` par profil : on le suit dès qu'il est présent,
 * pour ne plus proposer un choix que `PATCH /api/groups/:id` refusera (« Prof de classe »
 * était offert puis rejeté en « default_role_id invalide »). Le filtre local ne sert plus
 * que de repli face à une API plus ancienne.
 *
 * @param {Array<object>} roles
 * @returns {Array<object>}
 */
export function filterGroupDefaultRoles(roles) {
  return (Array.isArray(roles) ? roles : []).filter((r) => {
    if (typeof r?.group_default_allowed === 'boolean') return r.group_default_allowed;
    const slug = String(r?.slug || '').toLowerCase();
    return (
      slug === 'visiteur' ||
      slug === 'personnel' ||
      slug.startsWith('eleve_') ||
      (Number(r?.rank) > 0 && Number(r?.rank) < 400 && !slug.startsWith('gl_'))
    );
  });
}
