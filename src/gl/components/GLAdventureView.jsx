import React, { lazy, Suspense } from 'react';
import { isModuleEnabled } from '../constants/modules.js';
import { GL_ADVENTURE_SUB_TABS } from '../constants/app-runtime.js';
import { GLSpellsView } from './GLSpellsView.jsx';
import { GLSeleneCarnetView } from './GLSeleneCarnetView.jsx';

const GLHistoryView = lazy(() =>
  import('./GLHistoryView.jsx').then((m) => ({ default: m.GLHistoryView })),
);

/**
 * Onglet « L'aventure » : regroupe histoire, carnet Sélène et sortilèges.
 */
export function GLAdventureView({
  activeSubTab,
  onSubTabChange,
  modules,
  gameState,
  brandSlots,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onOpenGlossaryTerm,
  onOpenLoreTerm,
  onOpenSpell,
  canSpellCast,
  onLaunchSpell,
  isMj,
}) {
  const visibleSubTabs = GL_ADVENTURE_SUB_TABS.filter((subTab) => {
    if (!subTab.module) return true;
    return isModuleEnabled(modules, subTab.module);
  });

  return (
    <div className="gl-adventure-view fade-in">
      <nav className="gl-subtabs gl-adventure-view__tabs" role="tablist" aria-label="L'aventure">
        {visibleSubTabs.map((subTab) => (
          <button
            key={subTab.id}
            type="button"
            role="tab"
            id={`gl-adventure-subtab-${subTab.id}`}
            aria-selected={activeSubTab === subTab.id}
            aria-controls={`gl-adventure-panel-${subTab.id}`}
            className={activeSubTab === subTab.id ? 'is-active' : ''}
            onClick={() => onSubTabChange(subTab.id)}
          >
            <span className="foretmap-emoji-text-mixed" aria-hidden>
              {subTab.icon}
            </span>{' '}
            {subTab.label}
          </button>
        ))}
      </nav>

      <div
        role="tabpanel"
        id={`gl-adventure-panel-${activeSubTab}`}
        aria-labelledby={`gl-adventure-subtab-${activeSubTab}`}
      >
        {activeSubTab === 'history' ? (
          <Suspense fallback={<div className="gl-tab-loading" aria-busy="true" />}>
            <GLHistoryView
              gameState={gameState}
              glossaryLinkItems={glossaryLinkItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
            />
          </Suspense>
        ) : null}
        {activeSubTab === 'selene-carnet' ? (
          <GLSeleneCarnetView
            gameState={gameState}
            glossaryLinkItems={glossaryLinkItems}
            loreGlossaryLinkItems={loreGlossaryLinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
            onOpenLoreTerm={onOpenLoreTerm}
            isMj={isMj}
          />
        ) : null}
        {activeSubTab === 'spells' ? (
          <GLSpellsView
            gameState={gameState}
            brandSlots={brandSlots}
            onOpenSpell={onOpenSpell}
            canSpellCast={canSpellCast}
            onLaunchSpell={onLaunchSpell}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
          />
        ) : null}
      </div>
    </div>
  );
}
