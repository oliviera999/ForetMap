import { useMemo } from 'react';
import { renderMarkdownToSafeHtml } from '../shared/platform/markdown.js';
import { GlossaryMarkdown } from './GlossaryMarkdown.jsx';

/**
 * Affiche du Markdown léger en HTML sanitizé.
 *
 * Options facultatives : en passant un index de termes (`glossaryItems`) et un
 * gestionnaire (`onOpenGlossaryTerm`), les termes du glossaire cités dans le
 * texte deviennent cliquables (délégation à `GlossaryMarkdown`). Sans ces props,
 * le comportement est **inchangé**.
 *
 * @param {{ children?: string, className?: string, emptyFallback?: React.ReactNode,
 *   glossaryItems?: Array<{ glossary_code?: string, terme?: string, variantes?: string }>,
 *   onOpenGlossaryTerm?: (code: string) => void }} props
 */
function MarkdownContent({
  children,
  className = '',
  emptyFallback = null,
  style = undefined,
  glossaryItems = null,
  onOpenGlossaryTerm = undefined,
}) {
  const source = String(children ?? '').trim();
  const withGlossary =
    Array.isArray(glossaryItems) &&
    glossaryItems.length > 0 &&
    typeof onOpenGlossaryTerm === 'function';
  const html = useMemo(
    () => (withGlossary ? '' : renderMarkdownToSafeHtml(source)),
    [source, withGlossary],
  );

  if (withGlossary) {
    return (
      <GlossaryMarkdown
        className={className}
        style={style}
        emptyFallback={emptyFallback}
        glossaryItems={glossaryItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      >
        {children}
      </GlossaryMarkdown>
    );
  }

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
    <div
      className={`markdown-content ${className}`.trim()}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { MarkdownContent };
