import { useMemo } from 'react';
import { renderMarkdownToSafeHtml } from '../platform/markdown.js';

/**
 * Rendu Markdown par défaut du forum partagé (HTML nettoyé par `renderMarkdownToSafeHtml`).
 * ForetMap injecte le sien (`MarkdownContent`, liens automatiques vers le glossaire) ; G&L
 * utilise celui-ci avec sa classe `gl-markdown`.
 */
export function SharedForumMarkdown({ children, className = '' }) {
  const source = String(children ?? '');
  const html = useMemo(() => renderMarkdownToSafeHtml(source), [source]);
  if (!html) return <p className={className}>{source}</p>;
  return (
    <div
      className={`${className} forum-markdown`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Zone de saisie par défaut : texte simple + aide de mise en forme. ForetMap injecte son
 * éditeur visuel (`MarkdownTextarea`) à la place. `ref` est une prop ordinaire en React 19.
 */
export function ForumPlainEditor({ id, value, onChange, rows = 3, maxLength, required, ref }) {
  return (
    <>
      <textarea
        id={id}
        ref={ref}
        className="fm-textarea"
        value={value}
        onChange={onChange}
        rows={rows}
        maxLength={maxLength}
        required={required}
        aria-describedby={id ? `${id}-hint` : undefined}
      />
      <p id={id ? `${id}-hint` : undefined} className="forum-editor-hint">
        Mise en forme : **gras**, *italique*, « &gt; » en début de ligne pour citer, « - » pour une
        liste, [texte](https://…) pour un lien.
      </p>
    </>
  );
}
