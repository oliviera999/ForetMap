import React from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

export function GLHistoryView({ gameState }) {
  const html = DOMPurify.sanitize(marked.parse(gameState?.game?.story_markdown || 'Histoire non renseignee.'));
  return (
    <article className="gl-panel gl-markdown gl-animate-in">
      <h2>Histoire</h2>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
