import React, { useEffect, useMemo, useRef } from 'react';
import {
  renderMarkdownWithGlossaryLinks,
  renderPlainTextWithGlossaryLinks,
} from '../utils/foretmapGlossaryAutolink.js';
import { renderMarkdownToSafeHtml } from '../utils/markdown.js';

/**
 * Délégation d'événement sur le conteneur : un seul écouteur, quel que soit le
 * nombre de termes auto-liés. `preventDefault()` évite la navigation vers `#`
 * (et, dans un `<label>` de quiz, la bascule du bouton radio).
 */
function bindGlossaryClick(container, onOpenGlossaryTerm) {
  if (!container || typeof onOpenGlossaryTerm !== 'function') return () => {};
  const handler = (event) => {
    const link = event.target?.closest?.('[data-glossary-code]');
    if (!link || !container.contains(link)) return;
    event.preventDefault();
    const code = String(link.getAttribute('data-glossary-code') || '').trim();
    if (code) onOpenGlossaryTerm(code);
  };
  container.addEventListener('click', handler);
  return () => container.removeEventListener('click', handler);
}

/**
 * Markdown ForetMap avec les termes du glossaire hyperliés (pendant de
 * `GLGlossaryMarkdown`). Sans `glossaryItems`, le rendu est **exactement** celui
 * de `MarkdownContent`. Si l'auto-lien échoue, on retombe sur le markdown normal
 * plutôt que de casser l'écran.
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
  const containerRef = useRef(null);
  const source = String(markdown ?? children ?? '').trim();
  const hasGlossary = Array.isArray(glossaryItems) && glossaryItems.length > 0;

  const html = useMemo(() => {
    if (!source) return '';
    if (!hasGlossary) return renderMarkdownToSafeHtml(source, { allowImages });
    try {
      return renderMarkdownWithGlossaryLinks(source, glossaryItems, { allowImages });
    } catch (err) {
      console.warn('GlossaryMarkdown : auto-lien glossaire désactivé', err);
      return renderMarkdownToSafeHtml(source, { allowImages });
    }
  }, [source, glossaryItems, hasGlossary, allowImages]);

  useEffect(() => {
    return bindGlossaryClick(containerRef.current, onOpenGlossaryTerm);
  }, [html, onOpenGlossaryTerm]);

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
  const containerRef = useRef(null);
  const raw = String(text ?? '');
  const hasGlossary = Array.isArray(glossaryItems) && glossaryItems.length > 0;

  const html = useMemo(() => {
    if (!raw || !hasGlossary) return '';
    try {
      return renderPlainTextWithGlossaryLinks(raw, glossaryItems);
    } catch (err) {
      console.warn('GlossaryInlineText : auto-lien glossaire désactivé', err);
      return '';
    }
  }, [raw, glossaryItems, hasGlossary]);

  useEffect(() => {
    return bindGlossaryClick(containerRef.current, onOpenGlossaryTerm);
  }, [html, onOpenGlossaryTerm]);

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
