import {
  renderGlMarkdownWithGlossaryLinks,
  renderGlPlainTextWithGlossaryLinks,
} from '../../utils/glGlossaryAutolink.js';
import { renderMarkdownToSafeHtml } from '../../shared/platform/markdown.js';
import { GL_GLOSSARY_CODE_ATTR } from '../../shared/utils/glossaryLinkClick.js';
import { useGlossaryLinkedHtml } from '../../shared/hooks/useGlossaryLinkedHtml.js';

/**
 * Markdown GL avec termes glossaire hyperliés (popover au clic).
 *
 * Pendant de `GlossaryMarkdown` côté ForetMap : la mécanique commune (repli si
 * l'auto-lien échoue, délégation de clic) vit dans `useGlossaryLinkedHtml`, seuls
 * les rendus et l'attribut de données sont propres à G&L.
 */
export function GLGlossaryMarkdown({
  markdown,
  glossaryItems = [],
  onOpenGlossaryTerm,
  className = '',
  allowImages = true,
  allowJournalEmbeds = false,
  tag: Tag = 'div',
}) {
  const source = String(markdown ?? '').trim();
  const { html, containerRef } = useGlossaryLinkedHtml({
    source,
    glossaryItems,
    renderLinked: (text, items) =>
      renderGlMarkdownWithGlossaryLinks(text, items, { allowImages, allowJournalEmbeds }),
    renderPlain: (text) => renderMarkdownToSafeHtml(text, { allowImages, allowJournalEmbeds }),
    onOpenGlossaryTerm,
    codeAttribute: GL_GLOSSARY_CODE_ATTR,
    label: 'GLGlossaryMarkdown',
    renderDeps: [allowImages, allowJournalEmbeds],
  });

  if (!html) return null;

  return (
    <Tag ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/**
 * Texte brut GL avec termes glossaire hyperliés.
 */
export function GLGlossaryInlineText({
  text,
  glossaryItems = [],
  onOpenGlossaryTerm,
  className = '',
  tag: Tag = 'span',
}) {
  const raw = String(text ?? '');
  const { html, containerRef, hasGlossary } = useGlossaryLinkedHtml({
    source: raw,
    glossaryItems,
    renderLinked: renderGlPlainTextWithGlossaryLinks,
    onOpenGlossaryTerm,
    codeAttribute: GL_GLOSSARY_CODE_ATTR,
    label: 'GLGlossaryInlineText',
  });

  if (!raw) return null;

  if (!hasGlossary || !html) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
