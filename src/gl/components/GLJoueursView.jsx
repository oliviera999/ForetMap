import React, { lazy, Suspense } from 'react';
import { filterGlJoueursSubTabs } from '../utils/glAppShellHelpers.js';
import { GLStatsView } from './GLStatsView.jsx';

const GLForumView = lazy(() =>
  import('./GLForumView.jsx').then((m) => ({ default: m.GLForumView })),
);
const GLMarketView = lazy(() =>
  import('./GLMarketView.jsx').then((m) => ({ default: m.GLMarketView })),
);

/**
 * Onglet « Les joueurs » : regroupe forum, marché et statistiques.
 */
export function GLJoueursView({
  activeSubTab,
  onSubTabChange,
  modules,
  vitalityEnabled,
  includeMarket,
  showStaffAdminUi,
  canModerateForum,
  auth,
  classes,
  token,
  classId,
  playerId,
  selfHealthPoints,
  selfPowerPoints,
  onTradeCompleted,
}) {
  const visibleSubTabs = filterGlJoueursSubTabs(modules, { vitalityEnabled });

  return (
    <div className="gl-joueurs-view fade-in">
      <nav className="gl-subtabs gl-joueurs-view__tabs" role="tablist" aria-label="Les joueurs">
        {visibleSubTabs.map((subTab) => (
          <button
            key={subTab.id}
            type="button"
            role="tab"
            id={`gl-joueurs-subtab-${subTab.id}`}
            aria-selected={activeSubTab === subTab.id}
            aria-controls={`gl-joueurs-panel-${subTab.id}`}
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
        id={`gl-joueurs-panel-${activeSubTab}`}
        aria-labelledby={`gl-joueurs-subtab-${activeSubTab}`}
      >
        {activeSubTab === 'forum' ? (
          <Suspense fallback={<div className="gl-tab-loading" aria-busy="true" />}>
            <GLForumView canModerate={canModerateForum} />
          </Suspense>
        ) : null}
        {activeSubTab === 'market' && includeMarket ? (
          <Suspense fallback={<div className="gl-tab-loading" aria-busy="true" />}>
            <GLMarketView
              token={token}
              classId={classId}
              playerId={playerId}
              selfHealthPoints={selfHealthPoints}
              selfPowerPoints={selfPowerPoints}
              onTradeCompleted={onTradeCompleted}
            />
          </Suspense>
        ) : null}
        {activeSubTab === 'market' && !includeMarket ? (
          <p className="gl-market-placeholder" role="status">
            Le marché d&apos;échanges est réservé aux joueurs. Activez l&apos;aperçu joueur depuis
            la barre supérieure pour le tester.
          </p>
        ) : null}
        {activeSubTab === 'stats' ? (
          <GLStatsView
            mode={showStaffAdminUi ? 'class' : 'self'}
            classes={classes}
            auth={auth}
            vitalityEnabled={vitalityEnabled}
          />
        ) : null}
      </div>
    </div>
  );
}
