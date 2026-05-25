import React from 'react';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';

export function GLHistoryView({ gameState }) {
  const html = renderMarkdownToSafeHtml(gameState?.game?.story_markdown || 'Histoire non renseignee.', { allowImages: true });
  return (
    <article className="gl-panel gl-markdown gl-animate-in">
      <h2>Histoire</h2>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
