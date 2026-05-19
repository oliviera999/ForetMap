import React from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

export function GLBiotopeView({ gameState }) {
  const html = DOMPurify.sanitize(marked.parse(gameState?.game?.biotope_markdown || 'Biotope non renseigne.'));
  return (
    <article className="gl-panel gl-markdown">
      <h2>Biotope</h2>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
