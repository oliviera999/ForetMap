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

const FM_TABLES = Object.freeze([
  'resource_question_links',
  'resource_gating_policy',
  'resource_gating_cooldowns',
]);
const GL_TABLES = Object.freeze([
  'gl_resource_question_links',
  'gl_resource_gating_policy',
  'gl_resource_gating_cooldowns',
]);

function tablesFor(product) {
  return String(product || '').toLowerCase() === 'gl' ? GL_TABLES : FM_TABLES;
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
