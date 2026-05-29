import React from 'react';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';
import { GLSpeciesCatalog } from './GLSpeciesCatalog.jsx';

export function GLBiocenoseView({ gameState, onOpenGlossaryTerm }) {
  const introMarkdown = String(gameState?.game?.biocenose_markdown || '').trim();
  const introHtml = introMarkdown
    ? renderMarkdownToSafeHtml(introMarkdown, { allowImages: true })
    : '';
  const biomeSlug = gameState?.game?.biome_slug || null;
  const biomeNom = gameState?.game?.biome_nom || null;

  return (
    <article className="gl-panel gl-markdown gl-animate-in">
      <h2>Biocenose</h2>
      {introHtml ? (
        <div className="gl-biocenose-intro" dangerouslySetInnerHTML={{ __html: introHtml }} />
      ) : null}
      <GLSpeciesCatalog
        biomeSlug={biomeSlug}
        biomeNom={biomeNom}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />
    </article>
  );
}
