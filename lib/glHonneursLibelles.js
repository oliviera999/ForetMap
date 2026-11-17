'use strict';

/**
 * « Tenir à deux » — noms affichés des honneurs et des sceaux de peuple (ensemble unifié, L2).
 *
 * Module pur, sans dépendance : le journal (`lib/glJournalPresentTenir.js`) et le moteur des
 * honneurs (`lib/glHonneurs.js`) le lisent tous les deux.
 *
 * Les **clés techniques restent** (`eclaireurs`, `passeurs`, `eclaireuses` : colonne
 * `gl_game_honneurs.honneur`, codes de titres, catalogue `titres.json`) — les renommer demanderait
 * de réécrire des titres déjà remis. Seuls les noms visibles changent :
 * Éclaireurs → Avant-garde, Passeurs → Compagnons, Éclaireuses → Révélatrices. « Le Passeur » reste
 * celui qui lit la page de route : aucun honneur ne porte plus ce nom.
 */

const HONNEUR_LIBELLES = Object.freeze({
  eclaireurs: 'Avant-garde',
  gardiens: 'Gardiens du carnet',
  passeurs: 'Compagnons',
  esprit: "Esprit d'équipe",
  eclaireuses: 'Révélatrices',
  mains: 'Mains',
});

/** Nom affiché d'un honneur ou d'un sceau (repli : la clé, pour un honneur inconnu). */
function libelleHonneur(honneur) {
  return HONNEUR_LIBELLES[String(honneur || '')] || String(honneur || '');
}

module.exports = { HONNEUR_LIBELLES, libelleHonneur };
