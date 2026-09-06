'use strict';

// Chargement des lignes resource_gating_policy / gl_resource_gating_policy.

async function loadResourcePolicy(db, product, resourceType, resourceRef) {
  const table = product === 'gl' ? 'gl_resource_gating_policy' : 'resource_gating_policy';
  try {
    return await db.queryOne(
      `SELECT * FROM ${table} WHERE resource_type = ? AND resource_ref = ? LIMIT 1`,
      [resourceType, resourceRef],
    );
  } catch (_err) {
    return null;
  }
}

async function loadTypePolicy(db, product, resourceType) {
  return loadResourcePolicy(db, product, resourceType, '*');
}

/**
 * Politiques de PLUSIEURS ressources en une seule requête, plus la politique de type
 * (`resource_ref = '*'`) qui était relue à chaque tour de boucle.
 *
 * `buildGatingSummary` interrogeait la base 3 à 4 fois par ressource, en série : jusqu'à
 * ~240 requêtes SQL pour un seul appel HTTP sur une page de 60 fiches
 * (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, B4). Même correctif que pour le marché G&L.
 *
 * @returns {Promise<{ byRef: Map<string, object>, typePolicy: object|null }>}
 */
async function loadResourcePolicies(db, product, resourceType, refs = []) {
  const table = product === 'gl' ? 'gl_resource_gating_policy' : 'resource_gating_policy';
  const unique = [
    ...new Set(
      (Array.isArray(refs) ? refs : [])
        .map((r) => String(r == null ? '' : r).trim())
        .filter(Boolean),
    ),
  ];
  // `'*'` est toujours demandé : c'est la politique de type, commune à toute la liste.
  const wanted = [...unique, '*'];
  try {
    const rows = await db.queryAll(
      `SELECT * FROM ${table}
        WHERE resource_type = ? AND resource_ref IN (${wanted.map(() => '?').join(', ')})`,
      [resourceType, ...wanted],
    );
    const byRef = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      byRef.set(String(row.resource_ref), row);
    }
    return { byRef, typePolicy: byRef.get('*') || null };
  } catch (_err) {
    return { byRef: new Map(), typePolicy: null };
  }
}

module.exports = {
  loadResourcePolicy,
  loadResourcePolicies,
  loadTypePolicy,
};
