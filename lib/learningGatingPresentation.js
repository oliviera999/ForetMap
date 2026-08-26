'use strict';

// =====================================================================
// Presentation du conditionnement — resolue cote SERVEUR, pour les deux produits.
//
// Deux reglages ne changent rien a la decision de conditionnement, seulement a ce que le
// lecteur en voit AVANT de cliquer : l'annonce portee par le bouton et les pastilles
// d'etat (acquis / en attente / bloque). Ils sont de portee prof, donc illisibles par un
// eleve ou un joueur : le front ne peut pas les consulter lui-meme.
//
// D'ou ce module : les routes `gating/challenge` et `gating/summary` des deux produits
// les resolvent ici et les renvoient dans leur reponse. Le front n'a alors qu'un objet a
// respecter, identique des deux cotes, et aucun reglage prof n'est expose.
//
// `announce_on_button` etait, jusqu'ici, un reglage MORT : expose dans les deux grilles,
// consulte par aucun code. C'est ici qu'il prend enfin effet.
// =====================================================================

const { getFmGatingSite } = require('./learningGatingRuntime');
const { getGlGatingSettings } = require('./glSettings');

/**
 * Bloc de presentation d'un produit.
 * @param {'fm'|'gl'} product
 * @returns {Promise<{ announce_on_button: boolean, state_icons: boolean }>}
 */
async function getGatingPresentation(product) {
  const settings =
    String(product).toLowerCase() === 'gl' ? await getGlGatingSettings() : await getFmGatingSite();
  return {
    announce_on_button: settings?.announceOnButton !== false,
    state_icons: settings?.stateIcons !== false,
  };
}

/**
 * Applique la presentation a UN element de resume, pour que le composant partage n'ait
 * qu'un objet a lire. La redondance (le meme couple de booleens sur chaque ligne) est
 * assumee : elle evite de faire circuler un second canal jusqu'au bouton, qui ne recoit
 * aujourd'hui que le resume de sa propre ressource.
 */
function decorateSummaryItem(item, presentation) {
  return {
    ...item,
    announce: presentation.announce_on_button !== false,
    show_icon: presentation.state_icons !== false,
  };
}

module.exports = { getGatingPresentation, decorateSummaryItem };
