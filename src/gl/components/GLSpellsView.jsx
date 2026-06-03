import React from 'react';
import { renderMarkdownToSafeHtml } from '../../utils/markdown.js';
import { GLBrandPageBanner } from './GLBrandHub.jsx';
import { GLSpellCatalog } from './GLSpellCatalog.jsx';
import { GLButton } from './ui/GLButton.jsx';

export function GLSpellsView({
  gameState,
  brandSlots,
  onOpenSpell,
  canSpellCast = false,
  onLaunchSpell,
}) {
  const introMarkdown = String(gameState?.game?.sortileges_markdown || '').trim();
  const introHtml = introMarkdown
    ? renderMarkdownToSafeHtml(introMarkdown, { allowImages: true })
    : '';
  const chapterSpells = Array.isArray(gameState?.game?.chapter_spells)
    ? gameState.game.chapter_spells
    : [];

  return (
    <article className="gl-panel gl-spells-panel gl-grimoire gl-markdown fade-in">
      <h2 className="gl-spells-panel__title">Sortilèges</h2>
      {brandSlots?.card_spells ? (
        <GLBrandPageBanner slot={brandSlots.card_spells} />
      ) : null}
      {introHtml ? (
        <div className="gl-spells-intro" dangerouslySetInnerHTML={{ __html: introHtml }} />
      ) : null}
      {canSpellCast ? (
        <p className="gl-spells-launch-bar">
          <GLButton type="button" onClick={() => onLaunchSpell?.(null)}>
            Lancer un sortilège
          </GLButton>
        </p>
      ) : null}
      <GLSpellCatalog chapterSpells={chapterSpells} onOpenSpell={onOpenSpell} />
    </article>
  );
}
