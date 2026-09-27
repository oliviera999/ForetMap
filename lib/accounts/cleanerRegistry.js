'use strict';

/**
 * Registre des « nettoyeurs » de compte et de groupe (piste B, étape B6 ; ligne 16 du § 3.3 de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`).
 *
 * Avant ce registre, la suppression d'un élève (`lib/studentDeletion.js`), la fusion de deux
 * comptes (`lib/accountMerge.js`), la suppression d'un groupe (`routes/groups.js`) et le
 * renommage d'un compte (`routes/rbac.js`) écrivaient directement dans les tables de quatre
 * autres domaines. Désormais **chaque domaine déclare**, dans son propre dossier, ce qu'il fait
 * de ses lignes quand un compte ou un groupe disparaît :
 *
 * | Domaine            | Déclaration                              |
 * | ------------------ | ---------------------------------------- |
 * | Produit G&L        | `lib/accounts/glAccountCleaners.js`      |
 * | Vie sociale        | `lib/social/accountCleaners.js`          |
 * | Identité           | `lib/accounts/identityAccountCleaners.js`|
 * | Tâches             | `lib/tasks/accountCleaners.js`           |
 * | Observations       | `lib/observations/accountCleaners.js`    |
 *
 * Une déclaration porte un `domain` (libellé), un `product` (`foret` ou `gl`) et des crochets
 * facultatifs, chacun avec son **ordre** : l'ordre des effets est celui d'avant le registre
 * (les instantanés de `tests/account-cleaners-characterization.test.js` le vérifient), et il
 * compte — tout se joue dans une même transaction, et des clés étrangères suppriment en
 * cascade.
 *
 *   - `studentDelete`      `{ order, run(tx, student) }` dans la transaction de suppression ;
 *                          rend une contribution au bilan (fusionnée), ou `{ abort }` pour
 *                          annuler la suppression (la transaction ne supprime rien d'autre) ;
 *   - `afterStudentDelete` `{ order, run(summary) }` après validation de la transaction ;
 *   - `groupDetach`        `{ order, run(tx, groupId) }` dans la transaction de suppression
 *                          d'un groupe : détache les références sans clé étrangère ;
 *   - `studentRename`      `{ order, run(db, { studentId, firstName, lastName }) }` : noms
 *                          dénormalisés ;
 *   - `mergeRefs`          `{ order, refs }` : colonnes polymorphes `(type, id)` sans clé
 *                          étrangère, réattribuées (ou abandonnées, `dropInstead`) à la fusion ;
 *   - `mergeSpecialForeignKeys` : clés étrangères vers `users.id` que la fusion ne réattribue
 *                          pas aveuglément (règle métier propre au domaine).
 *
 * Les clés étrangères **déclarées en base** vers `users.id` n'ont pas besoin d'être déclarées
 * ici : la fusion les découvre dans `INFORMATION_SCHEMA` (`lib/accountMerge.js`).
 */

const { execute } = require('../../database');

/** Déclarations, par domaine. Ajouter un domaine = ajouter son fichier à cette liste. */
const ACCOUNT_CLEANERS = [
  require('./glAccountCleaners'),
  ...require('../social/accountCleaners'),
  require('./identityAccountCleaners'),
  require('../tasks/accountCleaners'),
  require('../observations/accountCleaners'),
];

/** Crochets `hook` déclarés, triés par ordre (stable : à ordre égal, ordre de la liste). */
function hooksOf(hook, cleaners = ACCOUNT_CLEANERS) {
  return cleaners
    .filter((c) => c[hook])
    .map((c, index) => ({ cleaner: c, hook: c[hook], index }))
    .sort((a, b) => a.hook.order - b.hook.order || a.index - b.index);
}

/**
 * Nettoyeurs de la suppression d'un élève, dans la transaction, avant `DELETE FROM users`.
 * @param {object} tx exécuteur de transaction (`withTransaction`)
 * @param {object} student ligne `users` de l'élève
 * @param {{ skipProducts?: string[] }} [options] produits dont les nettoyeurs sont sautés
 * @returns {Promise<{ ok: true, contributions: object } | { ok: false, abort: object }>}
 */
async function runStudentDeleteCleaners(tx, student, { skipProducts = [] } = {}) {
  const contributions = {};
  for (const { cleaner, hook } of hooksOf('studentDelete')) {
    if (skipProducts.includes(cleaner.product)) continue;
    const out = (await hook.run(tx, student)) || {};
    if (out.abort) return { ok: false, abort: out.abort };
    Object.assign(contributions, out);
  }
  return { ok: true, contributions };
}

/** Suites de la suppression d'un élève, une fois la transaction validée. */
async function runAfterStudentDeleteCleaners(summary) {
  for (const { hook } of hooksOf('afterStudentDelete')) {
    await hook.run(summary);
  }
}

/** Détachement des références à un groupe supprimé, dans la transaction de suppression. */
async function runGroupDetachCleaners(tx, groupId) {
  for (const { hook } of hooksOf('groupDetach')) {
    await hook.run(tx, groupId);
  }
}

/** Mise à jour des noms dénormalisés d'un élève renommé (hors transaction, comme avant). */
async function runStudentRenameCleaners({ studentId, firstName, lastName }, db = { execute }) {
  for (const { hook } of hooksOf('studentRename')) {
    await hook.run(db, { studentId, firstName, lastName });
  }
}

/** Colonnes polymorphes `(type, id)` que la fusion réattribue, dans l'ordre de traitement. */
function collectMergePolymorphicRefs() {
  return hooksOf('mergeRefs').flatMap(({ hook }) => hook.refs.map((ref) => ({ ...ref })));
}

/** Clés étrangères `table.colonne` que la fusion laisse à une règle métier du domaine. */
function collectMergeSpecialForeignKeys() {
  return ACCOUNT_CLEANERS.flatMap((c) => c.mergeSpecialForeignKeys || []);
}

/** Inventaire lisible (diagnostic, tests) : domaine, produit et crochets déclarés. */
function describeAccountCleaners() {
  const HOOKS = [
    'studentDelete',
    'afterStudentDelete',
    'groupDetach',
    'studentRename',
    'mergeRefs',
  ];
  return ACCOUNT_CLEANERS.map((c) => ({
    domain: c.domain,
    product: c.product,
    hooks: HOOKS.filter((h) => c[h]),
    mergeSpecialForeignKeys: c.mergeSpecialForeignKeys || [],
  }));
}

module.exports = {
  ACCOUNT_CLEANERS,
  runStudentDeleteCleaners,
  runAfterStudentDeleteCleaners,
  runGroupDetachCleaners,
  runStudentRenameCleaners,
  collectMergePolymorphicRefs,
  collectMergeSpecialForeignKeys,
  describeAccountCleaners,
};
