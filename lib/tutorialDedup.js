'use strict';

/**
 * Fusion des tutoriels en doublon (audit docs/AUDIT_BDD_2026-08.md §5.4).
 *
 * Origine du problème : le jeu de démarrage de `sql/schema_foretmap.sql` était rejoué à
 * chaque appel d'`initSchema()`, donc à chaque démarrage. Sa clé unique porte sur `slug` ;
 * quand l'import depuis `tutos/*.html` avait déjà créé la fiche sous un autre slug —
 * « le-desherbage-doux » dérivé du titre H1 contre « desherbage-doux » du jeu de
 * démarrage — l'`INSERT IGNORE` ne voyait aucun doublon et insérait une seconde copie du
 * même contenu. La production comptait 24 tutoriels pour 14 contenus distincts, la plupart
 * affichés DEUX FOIS aux élèves. La cause est fermée (garde `WHERE NOT EXISTS`) ; ce module
 * répare l'existant.
 *
 * Critère de regroupement : `html_content` identique, octet pour octet. Purement mécanique,
 * il ne présume rien des titres — deux fiches au contenu identique SONT la même fiche.
 *
 * La fusion ne perd aucun lien : chaque table enfant est repointée vers le tutoriel
 * conservé avant suppression des doublons. Le couple `UPDATE IGNORE` puis `DELETE` traite
 * les collisions de clé primaire sans avoir à connaître la forme de chaque table — une
 * ligne qui ferait doublon après repointage n'est pas déplacée, elle est supprimée avec
 * son tutoriel d'origine.
 */

/** Tables liées à `tutorials(id)` par clé étrangère. */
const CHILD_TABLES = Object.freeze([
  'glossary_term_tutorials',
  'project_tutorials',
  'quiz_question_tutorials',
  'task_tutorials',
  'tutorial_markers',
  'tutorial_zones',
  'user_tutorial_reads',
  'visit_tutorials',
]);

/** Tables référençant un tutoriel par référence polymorphe (pas de clé étrangère possible). */
const POLYMORPHIC_TABLES = Object.freeze(['resource_question_links', 'resource_gating_policy']);

/**
 * Groupes de tutoriels partageant exactement le même `html_content`.
 * Le tutoriel conservé est le plus ancien (plus petit `id`) : c'est celui vers lequel les
 * liens historiques pointent le plus probablement.
 *
 * @param {{ queryAll: Function }} db
 * @returns {Promise<Array<{ keep: object, drop: object[] }>>}
 */
async function findDuplicateGroups(db) {
  const rows = await db.queryAll(
    `SELECT id, title, slug, is_active, sort_order, CHAR_LENGTH(html_content) AS content_length,
            SHA2(html_content, 256) AS content_hash
       FROM tutorials
      WHERE html_content IS NOT NULL AND html_content <> ''
      ORDER BY id ASC`,
  );
  const byHash = new Map();
  for (const row of rows) {
    if (!byHash.has(row.content_hash)) byHash.set(row.content_hash, []);
    byHash.get(row.content_hash).push(row);
  }
  const groups = [];
  for (const list of byHash.values()) {
    if (list.length < 2) continue;
    groups.push({ keep: list[0], drop: list.slice(1) });
  }
  return groups;
}

/**
 * Repointe tous les liens d'un groupe vers `keepId`, puis supprime les doublons.
 * À exécuter dans une transaction.
 *
 * @param {{ execute: Function }} tx connexion transactionnelle (`withTransaction`)
 * @param {number} keepId
 * @param {number[]} dropIds
 * @returns {Promise<{ relinked: Record<string, number>, deleted: number }>}
 */
async function mergeTutorialGroup(tx, keepId, dropIds) {
  const relinked = {};
  if (!Array.isArray(dropIds) || dropIds.length === 0) return { relinked, deleted: 0 };
  const placeholders = dropIds.map(() => '?').join(', ');

  for (const table of CHILD_TABLES) {
    const res = await tx.execute(
      `UPDATE IGNORE ${table} SET tutorial_id = ? WHERE tutorial_id IN (${placeholders})`,
      [keepId, ...dropIds],
    );
    relinked[table] = Number(res?.affectedRows || 0);
    // Reliquat : lignes non déplacées faute de place (doublon de clé primaire après
    // repointage). Elles seraient de toute façon emportées par ON DELETE CASCADE.
    await tx.execute(`DELETE FROM ${table} WHERE tutorial_id IN (${placeholders})`, dropIds);
  }

  for (const table of POLYMORPHIC_TABLES) {
    const res = await tx.execute(
      `UPDATE IGNORE ${table} SET resource_ref = ?
        WHERE resource_type = 'tutorial' AND resource_ref IN (${placeholders})`,
      [String(keepId), ...dropIds.map(String)],
    );
    relinked[table] = Number(res?.affectedRows || 0);
    await tx.execute(
      `DELETE FROM ${table} WHERE resource_type = 'tutorial' AND resource_ref IN (${placeholders})`,
      dropIds.map(String),
    );
  }

  const del = await tx.execute(`DELETE FROM tutorials WHERE id IN (${placeholders})`, dropIds);
  return { relinked, deleted: Number(del?.affectedRows || 0) };
}

module.exports = {
  findDuplicateGroups,
  mergeTutorialGroup,
  CHILD_TABLES,
  POLYMORPHIC_TABLES,
};
