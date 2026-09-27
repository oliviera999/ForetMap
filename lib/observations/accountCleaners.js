'use strict';

/**
 * Observations — ce que le carnet d'observations fait de ses lignes quand un groupe disparaît
 * (registre `lib/accounts/cleanerRegistry.js`).
 *
 * `observation_logs.student_id` est une clé étrangère vers `users` (suppression en cascade,
 * réattribution automatique à la fusion) : seul le rattachement au groupe, sans contrainte,
 * est à déclarer.
 */

module.exports = {
  domain: 'Observations',
  product: 'foret',
  // Sans ce détachement, l'observation restait rattachée à un groupe fantôme.
  groupDetach: {
    order: 30,
    async run(tx, groupId) {
      await tx.execute('UPDATE observation_logs SET group_id = NULL WHERE group_id = ?', [groupId]);
    },
  },
};
