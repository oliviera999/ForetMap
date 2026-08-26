import { useEffect, useMemo, useRef } from 'react';

import { bindGlossaryLinkClick } from '../utils/glossaryLinkClick.js';

/**
 * Rendu d'un texte dont les termes de glossaire sont hyperliés — logique COMMUNE
 * aux deux applications.
 *
 * Les quatre composants concernés (`GlossaryMarkdown` / `GlossaryInlineText` côté
 * ForetMap, `GLGlossaryMarkdown` / `GLGlossaryInlineText` côté G&L) répétaient
 * chacun la même mécanique : décider s'il y a des termes à lier, produire le HTML,
 * **retomber sur un rendu sans liens plutôt que casser l'écran** si l'auto-lien
 * échoue, puis brancher la délégation de clic. Seuls changent les fonctions de
 * rendu et l'attribut de données du produit.
 *
 * Le repli est le point qui méritait d'être écrit une seule fois : un terme mal
 * formé dans la base ne doit jamais faire disparaître le texte que l'élève lit.
 *
 * @param {{
 *   source?: string,
 *   glossaryItems?: Array<object>,
 *   renderLinked: (source: string, items: Array<object>) => string,
 *   renderPlain?: ((source: string) => string) | null,
 *   onOpenGlossaryTerm?: (code: string) => void,
 *   codeAttribute: string,
 *   label: string,
 *   renderDeps?: Array<unknown>,
 * }} params
 * @returns {{ html: string, containerRef: React.RefObject<Element>, hasGlossary: boolean }}
 */
export function useGlossaryLinkedHtml({
  source = '',
  glossaryItems = [],
  renderLinked,
  renderPlain = null,
  onOpenGlossaryTerm,
  codeAttribute,
  label,
  renderDeps = [],
}) {
  const containerRef = useRef(null);
  const hasGlossary = Array.isArray(glossaryItems) && glossaryItems.length > 0;

  const html = useMemo(() => {
    if (!source) return '';
    if (!hasGlossary) return renderPlain ? renderPlain(source) : '';
    try {
      return renderLinked(source, glossaryItems);
    } catch (err) {
      console.warn(`${label} : auto-lien glossaire désactivé`, err);
      return renderPlain ? renderPlain(source) : '';
    }
    // `renderLinked` / `renderPlain` sont redéfinis à chaque rendu par les appelants
    // (fermetures sur leurs options) : les inclure relancerait le calcul à chaque
    // fois et viderait la mémoïsation de son intérêt. Les options dont le rendu
    // dépend réellement passent par `renderDeps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, glossaryItems, hasGlossary, label, ...renderDeps]);

  useEffect(
    () => bindGlossaryLinkClick(containerRef.current, onOpenGlossaryTerm, codeAttribute),
    [html, onOpenGlossaryTerm, codeAttribute],
  );

  return { html, containerRef, hasGlossary };
}
