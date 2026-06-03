import React from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';

export function GLBiotopeView({ gameState, glossaryLinkItems = [], onOpenGlossaryTerm }) {
  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Biotope</h2>
      <GLGlossaryMarkdown
        markdown={gameState?.game?.biotope_markdown || 'Biotope non renseigne.'}
        glossaryItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        allowImages
      />
    </article>
  );
}
