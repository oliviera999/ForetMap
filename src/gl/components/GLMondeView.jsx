import React, { lazy, Suspense } from 'react';
import { isModuleEnabled } from '../constants/modules.js';
import { GL_MONDE_SUB_TABS } from '../constants/app-runtime.js';
import { GLWorldView } from './GLWorldView.jsx';
import { GLRulesView } from './GLRulesView.jsx';
import { GLLoreGlossaryView } from './GLLoreGlossaryView.jsx';

const GLTutorialsView = lazy(() =>
  import('./GLTutorialsView.jsx').then((m) => ({ default: m.GLTutorialsView })),
);

/**
 * Onglet « Le monde G&L » : regroupe introduction, règles, lexique lore et tutoriels.
 */
export function GLMondeView({
  activeSubTab,
  onSubTabChange,
  modules,
  auth,
  brandSlots,
  glossaryLinkItems = [],
  onNavigateTab,
  onOpenGlossaryTerm,
  loreGlossaryFocusCode,
  loreGlossaryPopoverCode,
  onOpenLoreGlossaryPopover,
  onLoreGlossaryFocusHandled,
  canManageTutorials = false,
  learningProgress,
}) {
  const visibleSubTabs = GL_MONDE_SUB_TABS.filter((subTab) => {
    if (!subTab.module) return true;
    return isModuleEnabled(modules, subTab.module);
  });

  return (
    <div className="gl-monde-view fade-in">
      <nav className="gl-subtabs gl-monde-view__tabs" role="tablist" aria-label="Le monde G&L">
        {visibleSubTabs.map((subTab) => (
          <button
            key={subTab.id}
            type="button"
            role="tab"
            id={`gl-monde-subtab-${subTab.id}`}
            aria-selected={activeSubTab === subTab.id}
            aria-controls={`gl-monde-panel-${subTab.id}`}
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
        id={`gl-monde-panel-${activeSubTab}`}
        aria-labelledby={`gl-monde-subtab-${activeSubTab}`}
      >
        {activeSubTab === 'world' ? (
          <GLWorldView
            auth={auth}
            brandSlots={brandSlots}
            onNavigateTab={onNavigateTab}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
          />
        ) : null}
        {activeSubTab === 'rules' ? (
          <GLRulesView
            auth={auth}
            brandSlots={brandSlots}
            onNavigateTab={onNavigateTab}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
          />
        ) : null}
        {activeSubTab === 'lore-glossary' ? (
          <GLLoreGlossaryView
            focusCode={loreGlossaryFocusCode}
            activeTermCode={loreGlossaryPopoverCode}
            onOpenPopover={onOpenLoreGlossaryPopover}
            onFocusHandled={onLoreGlossaryFocusHandled}
          />
        ) : null}
        {activeSubTab === 'tutorials' ? (
          <Suspense fallback={<div className="gl-tab-loading" aria-busy="true" />}>
            <GLTutorialsView
              canManage={canManageTutorials}
              learningProgress={learningProgress}
              glossaryLinkItems={glossaryLinkItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
