import React from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { useGlMarkdownWithLegacyMedia } from '../hooks/useGlMarkdownWithLegacyMedia.js';

export function GLBiotopeView({ gameState, glossaryLinkItems = [], onOpenGlossaryTerm }) {
  const markdown = useGlMarkdownWithLegacyMedia(
    gameState?.game?.biotope_markdown || 'Biotope non renseigne.',
  );
  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Biotope</h2>
      <GLGlossaryMarkdown
        markdown={markdown}
        glossaryItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        allowImages
      />
    </article>
  );
}
