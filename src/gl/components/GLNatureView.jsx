import React from 'react';
import { GL_NATURE_SUB_TABS } from '../constants/app-runtime.js';
import { GLEcosystemsView } from './GLEcosystemsView.jsx';
import { GLBiodiversityView } from './GLBiodiversityView.jsx';
import { GLGlossaryView } from './GLGlossaryView.jsx';

/**
 * Onglet « La nature » : regroupe écosystèmes, biodiversité et glossaire SVT.
 */
export function GLNatureView({
  activeSubTab,
  onSubTabChange,
  gameState,
  glossaryLinkItems = [],
  onOpenGlossaryTerm,
  glossaryFocusCode,
  glossaryPopoverCode,
  onGlossaryFocusHandled,
  learningProgress,
}) {
  return (
    <div className="gl-nature-view fade-in">
      <nav className="gl-subtabs gl-nature-view__tabs" role="tablist" aria-label="La nature">
        {GL_NATURE_SUB_TABS.map((subTab) => (
          <button
            key={subTab.id}
            type="button"
            role="tab"
            id={`gl-nature-subtab-${subTab.id}`}
            aria-selected={activeSubTab === subTab.id}
            aria-controls={`gl-nature-panel-${subTab.id}`}
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
        id={`gl-nature-panel-${activeSubTab}`}
        aria-labelledby={`gl-nature-subtab-${activeSubTab}`}
      >
        {activeSubTab === 'ecosystemes' ? (
          <GLEcosystemsView
            gameState={gameState}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
          />
        ) : null}
        {activeSubTab === 'biodiversite' ? (
          <GLBiodiversityView
            gameState={gameState}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
            glossaryLinkItems={glossaryLinkItems}
            learningProgress={learningProgress}
            loreCarnetEnabled={false}
          />
        ) : null}
        {activeSubTab === 'glossary' ? (
          <GLGlossaryView
            gameState={gameState}
            focusCode={glossaryFocusCode}
            activeTermCode={glossaryPopoverCode}
            onOpenPopover={onOpenGlossaryTerm}
            onFocusHandled={onGlossaryFocusHandled}
            learningProgress={learningProgress}
          />
        ) : null}
      </div>
    </div>
  );
}
