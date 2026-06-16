import React, { useEffect, useMemo, useRef } from 'react';
import {
  renderGlMarkdownWithGlossaryLinks,
  renderGlPlainTextWithGlossaryLinks,
} from '../../utils/glGlossaryAutolink.js';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';

function bindGlossaryClick(container, onOpenGlossaryTerm) {
  if (!container || typeof onOpenGlossaryTerm !== 'function') return () => {};
  const handler = (event) => {
    const link = event.target.closest('[data-gl-glossary-code]');
    if (!link || !container.contains(link)) return;
    event.preventDefault();
    const code = String(link.getAttribute('data-gl-glossary-code') || '').trim();
    if (code) onOpenGlossaryTerm(code);
  };
  container.addEventListener('click', handler);
  return () => container.removeEventListener('click', handler);
}

/**
 * Markdown GL avec termes glossaire hyperliés (popover au clic).
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
  const containerRef = useRef(null);
  const hasGlossary = Array.isArray(glossaryItems) && glossaryItems.length > 0;
  const html = useMemo(() => {
    const raw = String(markdown ?? '').trim();
    if (!raw) return '';
    if (!hasGlossary) {
      return renderMarkdownToSafeHtml(raw, { allowImages, allowJournalEmbeds });
    }
    try {
      return renderGlMarkdownWithGlossaryLinks(raw, glossaryItems, {
        allowImages,
        allowJournalEmbeds,
      });
    } catch (err) {
      console.warn('GLGlossaryMarkdown: auto-lien glossaire désactivé', err);
      return renderMarkdownToSafeHtml(raw, { allowImages, allowJournalEmbeds });
    }
  }, [markdown, glossaryItems, hasGlossary, allowImages, allowJournalEmbeds]);

  useEffect(() => {
    return bindGlossaryClick(containerRef.current, onOpenGlossaryTerm);
  }, [html, onOpenGlossaryTerm]);

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
  const containerRef = useRef(null);
  const hasGlossary = Array.isArray(glossaryItems) && glossaryItems.length > 0;
  const html = useMemo(() => {
    const raw = String(text ?? '');
    if (!raw) return '';
    if (!hasGlossary) return '';
    try {
      return renderGlPlainTextWithGlossaryLinks(raw, glossaryItems);
    } catch (err) {
      console.warn('GLGlossaryInlineText: auto-lien glossaire désactivé', err);
      return '';
    }
  }, [text, glossaryItems, hasGlossary]);

  useEffect(() => {
    return bindGlossaryClick(containerRef.current, onOpenGlossaryTerm);
  }, [html, onOpenGlossaryTerm]);

  if (!String(text ?? '')) return null;

  if (!hasGlossary || !html) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
