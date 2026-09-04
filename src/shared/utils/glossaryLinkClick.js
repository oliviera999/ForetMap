/**
 * Ouverture d'une fiche de glossaire au clic sur un terme auto-lié — logique
 * COMMUNE aux deux applications.
 *
 * Les deux produits marquent leurs termes avec un attribut de données différent
 * (`data-glossary-code` côté ForetMap, `data-gl-glossary-code` côté G&L) mais
 * attendent exactement le même comportement, et le portaient chacun dans son
 * composant de rendu markdown. Seul l'attribut change : il devient un paramètre.
 *
 * Le principe : **un seul écouteur sur le conteneur**, quel que soit le nombre de
 * termes liés dans le texte rendu.
 */

/** Attribut portant le code du terme, par produit. */
export const FORETMAP_GLOSSARY_CODE_ATTR = 'data-glossary-code';
export const GL_GLOSSARY_CODE_ATTR = 'data-gl-glossary-code';
/** Glossaire **lore** G&L (univers du jeu), distinct du glossaire SVT. */
export const GL_LORE_GLOSSARY_CODE_ATTR = 'data-gl-lore-code';

/**
 * Branche la délégation de clic sur un conteneur de texte rendu.
 *
 * `preventDefault()` n'est pas cosmétique : sans lui, le lien navigue vers `#` —
 * et, quand le terme est rendu dans le `<label>` d'un choix de quiz, le clic
 * basculerait le bouton radio en même temps qu'il ouvre la définition.
 *
 * @param {Element | null | undefined} container conteneur du HTML rendu
 * @param {((code: string) => void) | undefined} onOpenGlossaryTerm
 * @param {string} codeAttribute attribut de données portant le code du terme
 * @returns {() => void} fonction de nettoyage (à rendre depuis un `useEffect`)
 */
export function bindGlossaryLinkClick(container, onOpenGlossaryTerm, codeAttribute) {
  if (!container || typeof onOpenGlossaryTerm !== 'function') return () => {};
  const selector = `[${codeAttribute}]`;
  const handler = (event) => {
    const link = event.target?.closest?.(selector);
    if (!link || !container.contains(link)) return;
    event.preventDefault();
    const code = String(link.getAttribute(codeAttribute) || '').trim();
    if (code) onOpenGlossaryTerm(code);
  };
  container.addEventListener('click', handler);
  return () => container.removeEventListener('click', handler);
}
