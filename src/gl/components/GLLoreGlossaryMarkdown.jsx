import {
  renderGlMarkdownWithLoreGlossaryLinks,
  renderGlPlainTextWithLoreGlossaryLinks,
} from '../../utils/glLoreGlossaryAutolink.js';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';
import { GL_LORE_GLOSSARY_CODE_ATTR } from '../../shared/utils/glossaryLinkClick.js';
import { useGlossaryLinkedHtml } from '../../shared/hooks/useGlossaryLinkedHtml.js';

/**
 * Markdown G&L avec termes du glossaire **lore** hyperliés (popover au clic).
 *
 * Pendant de `GLGlossaryMarkdown` (glossaire SVT) : la mécanique commune (repli
 * sans liens si l'auto-lien échoue, délégation de clic) vit dans
 * `useGlossaryLinkedHtml`, seuls les rendus et l'attribut de données
 * (`data-gl-lore-code`) sont propres au lore.
 */
export function GLLoreGlossaryMarkdown({
  markdown,
  loreGlossaryItems = [],
  onOpenLoreTerm,
  className = '',
  allowImages = true,
  tag: Tag = 'div',
}) {
  const source = String(markdown ?? '').trim();
  const { html, containerRef } = useGlossaryLinkedHtml({
    source,
    glossaryItems: loreGlossaryItems,
    renderLinked: (text, items) =>
      renderGlMarkdownWithLoreGlossaryLinks(text, items, { allowImages }),
    renderPlain: (text) => renderMarkdownToSafeHtml(text, { allowImages }),
    onOpenGlossaryTerm: onOpenLoreTerm,
    codeAttribute: GL_LORE_GLOSSARY_CODE_ATTR,
    label: 'GLLoreGlossaryMarkdown',
    renderDeps: [allowImages],
  });

  if (!html) return null;

  return (
    <Tag ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/**
 * Texte brut G&L avec termes du glossaire lore hyperliés — le HTML saisi est
 * échappé puis assaini (`renderGlPlainTextWithLoreGlossaryLinks`).
 */
export function GLLoreGlossaryInlineText({
  text,
  loreGlossaryItems = [],
  onOpenLoreTerm,
  className = '',
  tag: Tag = 'span',
}) {
  const raw = String(text ?? '');
  const { html, containerRef, hasGlossary } = useGlossaryLinkedHtml({
    source: raw,
    glossaryItems: loreGlossaryItems,
    renderLinked: renderGlPlainTextWithLoreGlossaryLinks,
    onOpenGlossaryTerm: onOpenLoreTerm,
    codeAttribute: GL_LORE_GLOSSARY_CODE_ATTR,
    label: 'GLLoreGlossaryInlineText',
  });

  if (!hasGlossary || !html) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
