import React from 'react';
import { GLSpeciesCatalog } from './GLSpeciesCatalog.jsx';

export function GLBiodiversityView({
  gameState,
  onOpenGlossaryTerm,
  glossaryLinkItems = [],
  learningProgress,
  loreCarnetEnabled = false,
}) {
  const biomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];

  return (
    <article className="gl-panel fade-in">
      <h2>Biodiversité</h2>
      <GLSpeciesCatalog
        biomes={biomes}
        gameId={gameState?.game?.id ?? null}
        loreCarnetEnabled={loreCarnetEnabled}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        glossaryLinkItems={glossaryLinkItems}
        learningProgress={learningProgress}
      />
    </article>
  );
}
