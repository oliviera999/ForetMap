import React from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

export function GLBiocenoseView({ gameState }) {
  const html = DOMPurify.sanitize(marked.parse(gameState?.game?.biocenose_markdown || 'Biocenose non renseignee.'));
  return (
    <article className="gl-panel gl-markdown gl-animate-in">
      <h2>Biocenose</h2>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
