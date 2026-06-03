import React from 'react';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';

export function GLBiotopeView({ gameState }) {
  const html = renderMarkdownToSafeHtml(gameState?.game?.biotope_markdown || 'Biotope non renseigne.', { allowImages: true });
  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Biotope</h2>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
