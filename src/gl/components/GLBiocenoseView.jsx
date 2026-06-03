import React from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLSpeciesCatalog } from './GLSpeciesCatalog.jsx';

export function GLBiocenoseView({
  gameState,
  onOpenGlossaryTerm,
  learningProgress,
  glossaryLinkItems = [],
}) {
  const introMarkdown = String(gameState?.game?.biocenose_markdown || '').trim();
  const biomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];

  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Biocenose</h2>
      {introMarkdown ? (
        <GLGlossaryMarkdown
          className="gl-biocenose-intro"
          markdown={introMarkdown}
          glossaryItems={glossaryLinkItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          allowImages
        />
      ) : null}
      <GLSpeciesCatalog
        biomes={biomes}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        learningProgress={learningProgress}
      />
    </article>
  );
}
