import React, { useMemo } from 'react';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { GLChapterScenes } from './GLChapterIllustration.jsx';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';
import { chapterIllustrations } from '../assets/index.js';
import { applyStorySceneRefs } from '../utils/glStorySceneRefs.js';
import { useGlMarkdownWithLegacyMedia } from '../hooks/useGlMarkdownWithLegacyMedia.js';

export function GLHistoryView({ gameState, glossaryLinkItems = [], onOpenGlossaryTerm }) {
  const chapterNumber = gameState?.game?.chapter_plateau_number ?? null;
  const assetsReady = useGlAssetsReady();
  const scenes = useMemo(
    () => (assetsReady && chapterNumber != null ? chapterIllustrations(chapterNumber) : []),
    [assetsReady, chapterNumber],
  );
  // Les références `![légende](scene:N)` du récit sont résolues vers les
  // scènes conventionnelles ; celles-ci quittent alors la galerie de fin.
  const storyMarkdown = useGlMarkdownWithLegacyMedia(gameState?.game?.story_markdown || '');
  const { markdown, usedKeys } = useMemo(
    () => applyStorySceneRefs(storyMarkdown, scenes),
    [storyMarkdown, scenes],
  );
  return (
    <article className="gl-panel gl-markdown fade-in">
      <h2>Histoire</h2>
      <GLGlossaryMarkdown
        markdown={markdown || 'Histoire non renseignee.'}
        glossaryItems={glossaryLinkItems}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        allowImages
      />
      <GLChapterScenes
        chapterNumber={chapterNumber}
        alt="Scène du récit"
        className="gl-chapter-scenes"
        figureClassName="gl-chapter-illustration gl-chapter-illustration--scene"
        excludeKeys={usedKeys}
      />
    </article>
  );
}
