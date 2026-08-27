/**
 * Consultation du glossaire pendant une question — règle COMMUNE aux deux applications.
 *
 * L'énoncé et les propositions de réponse étaient rendus avec l'auto-liaison du glossaire :
 * les termes reconnus y devenaient cliquables, et leur définition s'ouvrait d'un clic.
 * Sur une question du type « Comment appelle-t-on le processus par lequel… ? », consulter
 * le terme lié **donne la réponse**. Ce qui devait aider à comprendre servait à deviner.
 *
 * Règle retenue : **rien de consultable tant que l'élève n'a pas répondu.** Le texte reste
 * affiché tel quel — on ne masque pas des mots, on retire seulement la possibilité de les
 * ouvrir. Une fois la réponse envoyée, l'auto-liaison revient : à ce moment-là, aller lire
 * la définition est exactement ce qu'on veut encourager.
 *
 * Module PUR, sans React : il ne fait que neutraliser le jeu de propriétés passé aux
 * composants d'auto-liaison, quelle que soit sa forme (`glossaryItems` côté ForetMap et
 * biome G&L, `loreGlossaryItems` côté lore). Un nouveau jeu s'y range sans modification :
 * les tableaux sont vidés, les gestionnaires d'ouverture retirés.
 */

/** Référence stable : évite de recréer un tableau à chaque rendu (et donc de re-rendre). */
const EMPTY_ITEMS = Object.freeze([]);

/**
 * @param {object|null} inlineGlossaryProps propriétés d'auto-liaison de la surface.
 * @param {boolean} answered l'élève a-t-il déjà répondu à cette question ?
 * @returns {object} les mêmes propriétés, neutralisées tant qu'il n'a pas répondu.
 */
export function glossaryPropsWhileAnswering(inlineGlossaryProps, answered) {
  const props = inlineGlossaryProps || {};
  if (answered) return props;

  const neutral = {};
  for (const [key, value] of Object.entries(props)) {
    if (Array.isArray(value)) neutral[key] = EMPTY_ITEMS;
    else if (typeof value === 'function') neutral[key] = null;
    else neutral[key] = value;
  }
  return neutral;
}

/**
 * Faut-il proposer la liste des « termes utiles » à côté de la question ?
 *
 * Non tant que l'élève n'a pas répondu : une liste de termes affichée sous l'énoncé
 * désigne le sujet de la question aussi sûrement qu'un lien dans le texte. Après la
 * réponse, elle reprend tout son sens.
 */
export function showLinkedGlossaryTerms(answered) {
  return !!answered;
}
