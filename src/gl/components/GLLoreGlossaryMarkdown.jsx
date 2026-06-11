import React, { useEffect, useMemo, useRef } from 'react';
import {
  renderGlMarkdownWithLoreGlossaryLinks,
  renderGlPlainTextWithLoreGlossaryLinks,
} from '../../utils/glLoreGlossaryAutolink.js';
import { renderMarkdownToSafeHtml } from '../../utils/markdownRender.js';

function bindLoreClick(container, onOpenLoreTerm) {
  if (!container || typeof onOpenLoreTerm !== 'function') return () => {};
  const handler = (event) => {
    const link = event.target.closest('[data-gl-lore-code]');
    if (!link || !container.contains(link)) return;
    event.preventDefault();
    const code = String(link.getAttribute('data-gl-lore-code') || '').trim();
    if (code) onOpenLoreTerm(code);
  };
  container.addEventListener('click', handler);
  return () => container.removeEventListener('click', handler);
}

export function GLLoreGlossaryMarkdown({
  markdown,
  loreGlossaryItems = [],
  onOpenLoreTerm,
  className = '',
  allowImages = true,
  tag: Tag = 'div',
}) {
  const containerRef = useRef(null);
  const hasLore = Array.isArray(loreGlossaryItems) && loreGlossaryItems.length > 0;
  const html = useMemo(() => {
    const raw = String(markdown ?? '').trim();
    if (!raw) return '';
    if (!hasLore) return renderMarkdownToSafeHtml(raw, { allowImages });
    try {
      return renderGlMarkdownWithLoreGlossaryLinks(raw, loreGlossaryItems, { allowImages });
    } catch {
      return renderMarkdownToSafeHtml(raw, { allowImages });
    }
  }, [markdown, loreGlossaryItems, hasLore, allowImages]);

  useEffect(() => bindLoreClick(containerRef.current, onOpenLoreTerm), [html, onOpenLoreTerm]);

  if (!html) return null;
  return <Tag ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function GLLoreGlossaryInlineText({
  text,
  loreGlossaryItems = [],
  onOpenLoreTerm,
  className = '',
  tag: Tag = 'span',
}) {
  const containerRef = useRef(null);
  const html = useMemo(() => {
    const raw = String(text ?? '');
    if (!raw || !loreGlossaryItems?.length) return '';
    return renderGlPlainTextWithLoreGlossaryLinks(raw, loreGlossaryItems);
  }, [text, loreGlossaryItems]);

  useEffect(() => bindLoreClick(containerRef.current, onOpenLoreTerm), [html, onOpenLoreTerm]);

  if (!html) return <Tag className={className}>{text}</Tag>;
  return <Tag ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
