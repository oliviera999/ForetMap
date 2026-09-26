'use strict';

// =====================================================================
// Orphelins polymorphes du conditionnement (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, C7).
//
// Les liens ressource ↔ question, les politiques et les verrous désignent une ressource par
// le couple `(resource_type, resource_ref)` : aucune clé étrangère n'est possible. Quand la
// ressource disparaît (plante supprimée, terme retiré…), ces lignes restaient : un résumé
// pouvait encore annoncer un contrôle sur une fiche qui n'existe plus, et le tableau des
// verrous afficher un élève bloqué sur rien.
// =====================================================================

const {
  GATING_PRODUCT_CATALOG,
  gatingProductOrDefault,
  gatingTablesOf,
} = require('./pedago/gatingProductCatalog');

// Liens, politiques, verrous — tables décrites par le catalogue des produits.
const FM_TABLES = gatingTablesOf(GATING_PRODUCT_CATALOG.fm);
const GL_TABLES = gatingTablesOf(GATING_PRODUCT_CATALOG.gl);

function tablesFor(product) {
  return gatingTablesOf(gatingProductOrDefault(product));
}

/**
 * Supprime tout ce qui désignait la ressource. Best-effort par table : une table absente
 * (base ancienne) ne doit pas faire échouer la suppression de la ressource elle-même.
 * @param {{ execute: Function }} db
 * @returns {Promise<Record<string, number>>} lignes supprimées par table
 */
async function purgeResourceGatingRows(db, { product = 'fm', resourceType, resourceRef } = {}) {
  const type = String(resourceType || '').trim();
  const ref = String(resourceRef == null ? '' : resourceRef).trim();
  const removed = {};
  if (!db || !type || !ref) return removed;
  for (const table of tablesFor(product)) {
    try {
      const res = await db.execute(
        `DELETE FROM ${table} WHERE resource_type = ? AND resource_ref = ?`,
        [type, ref],
      );
      removed[table] = Number(res?.affectedRows || 0);
    } catch (_err) {
      removed[table] = 0;
    }
  }
  return removed;
}

module.exports = { FM_TABLES, GL_TABLES, purgeResourceGatingRows };
