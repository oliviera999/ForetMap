import {
  renderMarkdownWithGlossaryLinks,
  renderPlainTextWithGlossaryLinks,
} from '../utils/foretmapGlossaryAutolink.js';
import { renderMarkdownToSafeHtml } from '../shared/platform/markdown.js';
import { FORETMAP_GLOSSARY_CODE_ATTR } from '../shared/utils/glossaryLinkClick.js';
import { useGlossaryLinkedHtml } from '../shared/hooks/useGlossaryLinkedHtml.js';

/**
 * Markdown ForetMap avec les termes du glossaire hyperliés (pendant de
 * `GLGlossaryMarkdown`). Sans `glossaryItems`, le rendu est **exactement** celui
 * de `MarkdownContent`. Si l'auto-lien échoue, on retombe sur le markdown normal
 * plutôt que de casser l'écran — repli assuré par `useGlossaryLinkedHtml`, qui
 * porte cette mécanique pour les deux applications.
 *
 * @param {{
 *   markdown?: string, children?: string,
 *   glossaryItems?: Array<{ glossary_code?: string, terme?: string, variantes?: string }>,
 *   onOpenGlossaryTerm?: (code: string) => void,
 *   className?: string, allowImages?: boolean, tag?: string,
 *   emptyFallback?: React.ReactNode, style?: object,
 * }} props
 */
export function GlossaryMarkdown({
  markdown,
  children,
  glossaryItems = [],
  onOpenGlossaryTerm,
  className = '',
  allowImages = false,
  tag: Tag = 'div',
  emptyFallback = null,
  style = undefined,
}) {
  const source = String(markdown ?? children ?? '').trim();
  const { html, containerRef } = useGlossaryLinkedHtml({
    source,
    glossaryItems,
    renderLinked: (text, items) => renderMarkdownWithGlossaryLinks(text, items, { allowImages }),
    renderPlain: (text) => renderMarkdownToSafeHtml(text, { allowImages }),
    onOpenGlossaryTerm,
    codeAttribute: FORETMAP_GLOSSARY_CODE_ATTR,
    label: 'GlossaryMarkdown',
    renderDeps: [allowImages],
  });

  if (!source) {
    return emptyFallback != null ? <>{emptyFallback}</> : null;
  }

  if (!html) {
    return (
      <p className={`markdown-content markdown-content--plain ${className}`.trim()} style={style}>
        {source}
      </p>
    );
  }

  return (
    <Tag
      ref={containerRef}
      className={`markdown-content ${className}`.trim()}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Texte **brut** ForetMap (énoncé de quiz, choix, description d'interaction…)
 * avec les termes du glossaire hyperliés. Le HTML de la source est échappé avant
 * insertion des liens : un `<script>` saisi dans un énoncé reste du texte.
 *
 * @param {{
 *   text?: string,
 *   glossaryItems?: Array<{ glossary_code?: string, terme?: string, variantes?: string }>,
 *   onOpenGlossaryTerm?: (code: string) => void,
 *   className?: string, tag?: string,
 * }} props
 */
export function GlossaryInlineText({
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
    renderLinked: renderPlainTextWithGlossaryLinks,
    onOpenGlossaryTerm,
    codeAttribute: FORETMAP_GLOSSARY_CODE_ATTR,
    label: 'GlossaryInlineText',
  });

  if (!raw) return null;

  if (!hasGlossary || !html) {
    return <Tag className={className || undefined}>{text}</Tag>;
  }

  return (
    <Tag
      ref={containerRef}
      className={className || undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
