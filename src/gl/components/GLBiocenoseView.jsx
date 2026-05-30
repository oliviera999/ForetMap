import React from 'react';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';
import { GLSpeciesCatalog } from './GLSpeciesCatalog.jsx';

export function GLBiocenoseView({ gameState, onOpenGlossaryTerm }) {
  const introMarkdown = String(gameState?.game?.biocenose_markdown || '').trim();
  const introHtml = introMarkdown
    ? renderMarkdownToSafeHtml(introMarkdown, { allowImages: true })
    : '';
  const biomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];

  return (
    <article className="gl-panel gl-markdown gl-animate-in">
      <h2>Biocenose</h2>
      {introHtml ? (
        <div className="gl-biocenose-intro" dangerouslySetInnerHTML={{ __html: introHtml }} />
      ) : null}
      <GLSpeciesCatalog
        biomes={biomes}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />
    </article>
  );
}
