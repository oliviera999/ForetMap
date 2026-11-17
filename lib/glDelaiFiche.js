'use strict';

/**
 * « Tenir à deux » — délai d'attente après une mauvaise réponse à une fiche (ensemble unifié,
 * M23). Le conditionnement « marquer comme acquis » pose un verrou de nouvelle tentative
 * (`lib/learningGatingCooldown.js`) ; il contredit le garde-fou « une erreur ne coûte rien ».
 *
 * Quand le mode « Tenir » est actif, le réglage `gameplay.tenir_delai_fiche_secondes` (défaut 0)
 * prime sur toutes les couches de la politique de conditionnement G&L : à 0, plus aucun délai,
 * et « Seconde chance » n'a plus d'objet. Une valeur > 0 rétablit le délai — arrondi à l'heure
 * supérieure, parce que le verrou compte en heures entières.
 */

const { getGameplaySettings, heuresDuDelaiFiche } = require('./glSettings');

/** Secondes → heures entières du verrou (0 = aucun délai, sinon au moins 1 h). */
const heuresDuDelai = heuresDuDelaiFiche;

/**
 * Heures imposées au conditionnement G&L, ou `null` quand le mode « Tenir » est coupé (la
 * politique de conditionnement s'applique alors telle quelle). Même calcul que
 * `lib/glSettings.js › getGlGatingSiteSettings`, servi au moteur.
 * @returns {Promise<number|null>}
 */
async function delaiFicheForceHeures() {
  const gameplay = await getGameplaySettings();
  if (gameplay?.tenirEnabled !== true) return null;
  return heuresDuDelai(gameplay.tenirDelaiFicheSecondes);
}

/** Un délai est-il en vigueur pour les fiches G&L ? (`true` hors mode « Tenir » : inconnu ici.) */
async function delaiFicheActif() {
  const force = await delaiFicheForceHeures();
  return force == null ? true : force > 0;
}

module.exports = { heuresDuDelai, delaiFicheForceHeures, delaiFicheActif };
