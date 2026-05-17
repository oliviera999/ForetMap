import React, { useMemo } from 'react';
import { renderMarkdownToSafeHtml } from '../utils/markdown.js';

/**
 * Affiche du Markdown léger en HTML sanitizé.
 * @param {{ children?: string, className?: string, emptyFallback?: React.ReactNode }} props
 */
function MarkdownContent({ children, className = '', emptyFallback = null, style = undefined }) {
  const source = String(children ?? '').trim();
  const html = useMemo(() => renderMarkdownToSafeHtml(source), [source]);

  if (!source) {
    return emptyFallback != null ? <>{emptyFallback}</> : null;
  }

  if (!html) {
    return <p className={`markdown-content markdown-content--plain ${className}`.trim()} style={style}>{source}</p>;
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
