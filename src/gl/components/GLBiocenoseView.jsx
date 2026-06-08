import React from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLSpeciesCatalog } from './GLSpeciesCatalog.jsx';
import { GLChapterIllustration } from './GLChapterIllustration.jsx';

export function GLBiocenoseView({
  gameState,
  onOpenGlossaryTerm,
  learningProgress,
  glossaryLinkItems = [],
  loreCarnetEnabled = false,
}) {
  const introMarkdown = String(gameState?.game?.biocenose_markdown || '').trim();
  const chapterNumber = gameState?.game?.chapter_plateau_number ?? null;
  const biomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];

  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Biocenose</h2>
      <GLChapterIllustration
        chapterNumber={chapterNumber}
        alt="Illustration du chapitre"
        figureClassName="gl-chapter-illustration gl-chapter-illustration--cover"
      />
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
        gameId={gameState?.game?.id ?? null}
        loreCarnetEnabled={loreCarnetEnabled}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        learningProgress={learningProgress}
      />
    </article>
  );
}
