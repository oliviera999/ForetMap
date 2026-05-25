import React from 'react';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';

export function GLBiocenoseView({ gameState }) {
  const html = renderMarkdownToSafeHtml(gameState?.game?.biocenose_markdown || 'Biocenose non renseignee.', { allowImages: true });
  return (
    <article className="gl-panel gl-markdown gl-animate-in">
      <h2>Biocenose</h2>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
