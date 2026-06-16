import React from 'react';
import { GLBrandPageBanner } from './GLBrandHub.jsx';
import { GLSpellCatalog } from './GLSpellCatalog.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';

export function GLSpellsView({
  gameState,
  brandSlots,
  onOpenSpell,
  canSpellCast = false,
  onLaunchSpell,
  glossaryLinkItems = [],
  onOpenGlossaryTerm,
}) {
  const introMarkdown = String(gameState?.game?.sortileges_markdown || '').trim();
  const chapterSpells = Array.isArray(gameState?.game?.chapter_spells)
    ? gameState.game.chapter_spells
    : [];

  return (
    <article className="gl-panel gl-spells-panel gl-grimoire gl-markdown fade-in">
      <h2 className="gl-spells-panel__title">Sortilèges</h2>
      {brandSlots?.card_spells ? <GLBrandPageBanner slot={brandSlots.card_spells} /> : null}
      {introMarkdown ? (
        <GLGlossaryMarkdown
          className="gl-spells-intro"
          markdown={introMarkdown}
          glossaryItems={glossaryLinkItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          allowImages
        />
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
