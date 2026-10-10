'use strict';

/**
 * Catégorie `personnels` — comptes des personnels conservés jusqu'au départ + 1 an.
 *
 * Le départ d'un personnel est DÉCLARÉ par sa désactivation (formulaire d'administration) :
 * le compte est supprimé 12 mois après (`users.deactivated_at`), s'il n'a eu aucune activité
 * depuis 12 mois. Un enseignant simplement inactif n'est jamais supprimé — il peut rester en
 * poste sans utiliser l'outil une année : il est compté « à revoir » (actif, sans activité
 * depuis plus d'une année scolaire), pour la revue annuelle des comptes par l'administrateur.
 *
 * Toujours conservés :
 *   - un compte au profil administrateur (quel qu'il soit), et donc le dernier administrateur
 *     (`deleteTeacherById` le refuse en plus) ;
 *   - un compte lié à un compte de maître du jeu Gnomes & Licornes (`gl_admins`) : le jeu est
 *     hors du périmètre de cette purge (motif `compte_mj_jeu`).
 *
 * Suppression par `deleteTeacherById` (lib/teacherDeletion.js), le chemin de la route
 * d'administration : contenus conservés sans auteur, jetons, IP et navigateur des journaux,
 * libellés d'audit et avatar effacés.
 */

const { purgeAccounts } = require('../accountPurge');

function isMissingTableError(err) {
  return err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146;
}

async function isLinkedToGameMaster(db, id) {
  try {
    const row = await db.queryOne('SELECT id FROM gl_admins WHERE foretmap_user_id = ? LIMIT 1', [
      id,
    ]);
    return Boolean(row);
  } catch (err) {
    if (isMissingTableError(err)) return false;
    throw err;
  }
}

module.exports = {
  key: 'personnels',
  label: 'comptes personnels',
  async run(ctx) {
    const deleteTeacherById =
      ctx.deps?.deleteTeacherById || require('../../teacherDeletion').deleteTeacherById;
    return purgeAccounts(ctx, {
      userType: 'teacher',
      presumed: false,
      review: true,
      auditTargetType: 'user',
      logAudit: ctx.deps?.logAudit,
      async deleteAccount(id) {
        if (await isLinkedToGameMaster(ctx.db, id)) return { ok: false, reason: 'compte_mj_jeu' };
        return deleteTeacherById(id, { allowAdmin: false });
      },
    });
  },
};
