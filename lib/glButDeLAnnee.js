'use strict';

/**
 * « Tenir à deux » — le but de l'année (ensemble unifié, M19).
 *
 * La Consécration (`SL018`, 8 gemmes, troisième trimestre) se montre **dès le chapitre 1**,
 * grisée, avec son prix : c'est ce vers quoi la bourse de gemmes, gardée toute l'année, peut
 * aller. L'écran des sorts ne montre sinon que ce qui est lançable et payable ; cette carte en
 * est la seule exception, et ce n'est pas un bouton — on ne peut rien y lancer.
 *
 * Aucune bourse ici : la carte dit un prix, jamais un solde (les bourses restent privées).
 */

const glClock = require('./glClock');
const { trimestreOf } = require('./glTenir');

const CODE_CONSECRATION = 'SL018';

/**
 * @param {object} db `{ queryOne }`
 * @param {{ resolved?: object|null, date?: Date }} [options] réglages résolus de la partie
 *   (trimestres) ; `date` pour les tests
 * @returns {Promise<{ code, nom, emoji, cout, effetCourt, ouverte }|null>} `null` si le sort
 *   n'est pas au grimoire (catalogue pas encore chargé, sort retiré)
 */
async function butDeLAnnee(db, { resolved = null, date = null } = {}) {
  let sort;
  try {
    sort = await db.queryOne(
      `SELECT spell_code, nom, emoji, cout, effet_court FROM gl_spells
        WHERE spell_code = ? AND tenir_v2 = 1 AND statut = 'officiel' LIMIT 1`,
      [CODE_CONSECRATION],
    );
  } catch (err) {
    // Base en retard (colonnes du grimoire v2 absentes) : pas de carte.
    if (err?.errno === 1054 || err?.code === 'ER_BAD_FIELD_ERROR') return null;
    throw err;
  }
  if (!sort) return null;
  return {
    code: String(sort.spell_code),
    nom: String(sort.nom || ''),
    emoji: sort.emoji || null,
    cout: Math.max(0, Number(sort.cout) || 0),
    effetCourt: sort.effet_court || null,
    // Le troisième trimestre ouvre sa fenêtre : la carte le dit, sans devenir un bouton.
    ouverte: trimestreOf(date || glClock.now(), resolved) === 3,
  };
}

module.exports = { CODE_CONSECRATION, butDeLAnnee };
