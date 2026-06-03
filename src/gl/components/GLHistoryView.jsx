import React from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';

export function GLHistoryView({ gameState, glossaryLinkItems = [], onOpenGlossaryTerm }) {
  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Histoire</h2>
      <GLGlossaryMarkdown
        markdown={gameState?.game?.story_markdown || 'Histoire non renseignee.'}
        glossaryItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        allowImages
      />
    </article>
  );
}
