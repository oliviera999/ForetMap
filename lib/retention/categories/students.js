'use strict';

/**
 * Catégorie `eleves` — comptes élèves conservés jusqu'à la fin de la scolarité + 1 an.
 *
 * Supprimés (critères : `lib/retention/policy.js`) :
 *   - départ constaté : compte désactivé depuis plus de 12 mois ;
 *   - départ présumé : aucune activité pendant toute une année scolaire (fin de scolarité
 *     présumée au 31 août de la dernière année active, + 1 an).
 * Jamais un compte actif depuis moins de 12 mois, jamais un compte au profil administrateur.
 *
 * Suppression par `deleteStudentById` (lib/studentDeletion.js), le chemin de l'effacement
 * depuis l'application : forum, commentaires, tâches, observations, carnet et fichiers, joueur
 * Gnomes & Licornes lié, traces de journaux. Un élève dont le joueur est dans une partie en
 * cours est conservé (motif `gl_player_in_active_game`) et repris à l'exécution suivante.
 */

const { purgeAccounts } = require('../accountPurge');

module.exports = {
  key: 'eleves',
  label: 'comptes élèves',
  async run(ctx) {
    const deleteStudentById =
      ctx.deps?.deleteStudentById || require('../../studentDeletion').deleteStudentById;
    return purgeAccounts(ctx, {
      userType: 'student',
      presumed: true,
      auditTargetType: 'student',
      deleteAccount: (id) => deleteStudentById(id),
      logAudit: ctx.deps?.logAudit,
    });
  },
};
