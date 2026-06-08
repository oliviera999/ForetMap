import React from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLChapterScenes } from './GLChapterIllustration.jsx';

export function GLHistoryView({ gameState, glossaryLinkItems = [], onOpenGlossaryTerm }) {
  const chapterNumber = gameState?.game?.chapter_plateau_number ?? null;
  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Histoire</h2>
      <GLGlossaryMarkdown
        markdown={gameState?.game?.story_markdown || 'Histoire non renseignee.'}
        glossaryItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        allowImages
      />
      <GLChapterScenes
        chapterNumber={chapterNumber}
        alt="Scène du récit"
        className="gl-chapter-scenes"
        figureClassName="gl-chapter-illustration gl-chapter-illustration--scene"
      />
    </article>
  );
}
