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

module.exports = {
  loadResourcePolicy,
  loadTypePolicy,
};
