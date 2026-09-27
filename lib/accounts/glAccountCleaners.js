'use strict';

/**
 * Nettoyeur « produit G&L » du registre de comptes (`lib/accounts/cleanerRegistry.js`).
 *
 * **Adaptateur seulement** : ce fichier ne contient aucune règle G&L. Il délègue, sans rien
 * en modifier, au code existant qui s'en charge — `purgeLinkedGlPlayer` de
 * `lib/studentDeletion.js` (joueur lié au compte, refus si une partie le retient) — et déclare
 * la clé étrangère que la fusion laisse à la règle G&L (`gl_players.linked_foretmap_user_id`,
 * traitée dans `lib/accountMerge.js`, un joueur par compte au plus).
 *
 * `require` paresseux : `lib/studentDeletion.js` charge le registre, qui charge ce fichier.
 */

module.exports = {
  domain: 'Gnomes & Licornes (joueur lié)',
  product: 'gl',
  studentDelete: {
    order: 10,
    async run(tx, student) {
      const { purgeLinkedGlPlayer } = require('../studentDeletion');
      const gl = await purgeLinkedGlPlayer(tx, student.id);
      if (!gl.ok) return { abort: { reason: gl.reason, glPlayerId: gl.playerId } };
      return { glPlayerId: gl.playerId };
    },
  },
  mergeSpecialForeignKeys: ['gl_players.linked_foretmap_user_id'],
};
