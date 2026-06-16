import React, { useMemo, useState } from 'react';
import { useStickyHeaderScrolled } from '../../shared/hooks/useStickyHeaderScrolled.js';
import { GL_MOBILE_PRIMARY_TAB_IDS } from '../constants/app-runtime.js';
import { useGlCompactNav } from '../hooks/useGlCompactNav.js';
import { GLAppVersionBadge } from './GLAppVersionBadge.jsx';
import { GLBottomNav, GLMobileNavDrawer, GLNavTabButton } from './GLMobileNav.jsx';
import { GLMascotRenderer } from './GLMascotRenderer.jsx';
import { GLVitalityBadge } from './GLVitalityDisplay.jsx';

export const GL_TAB_ID_PREFIX = 'gl-tab';
export const GL_TABPANEL_ID_PREFIX = 'gl-tabpanel';

export function GLTopBar({
  tabs,
  activeTab,
  onTabChange,
  auth,
  platformTitle,
  platformSubtitle,
  brandLogoUrl,
  onLogout,
  onOpenProfile,
  onOpenStats = null,
  playerMascotId,
  vitalityEnabled = false,
  playerHealthPoints = null,
  playerPowerPoints = null,
  showVersion = false,
  appVersion = null,
  canSwitchGlPlayerView = false,
  glViewMode = 'native',
  onGlViewModeNative = null,
  onGlViewModePlayer = null,
}) {
  const isScrolled = useStickyHeaderScrolled();
  const compactNav = useGlCompactNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const title = String(platformTitle || 'Gnomes & Licornes');
  const subtitle = String(platformSubtitle || 'Le jeu de Sciences et Technologie');

  const primaryTabIds = useMemo(() => new Set(GL_MOBILE_PRIMARY_TAB_IDS), []);

  const primaryTabs = useMemo(
    () => tabs.filter((tab) => primaryTabIds.has(tab.id)),
    [tabs, primaryTabIds],
  );

  const overflowCount = Math.max(0, tabs.length - primaryTabs.length);

  function handleTabChange(tabId) {
    onTabChange(tabId);
    setDrawerOpen(false);
  }

  const userChrome = (
    <div className="gl-user">
      {showVersion ? <GLAppVersionBadge appVersion={appVersion} /> : null}
      {playerMascotId ? (
        <span className="gl-topbar-mascot" aria-hidden="true">
          <GLMascotRenderer mascotId={playerMascotId} size={32} />
        </span>
      ) : null}
      {vitalityEnabled && playerHealthPoints != null && playerPowerPoints != null ? (
        <GLVitalityBadge
          health={playerHealthPoints}
          power={playerPowerPoints}
          onClick={typeof onOpenStats === 'function' ? onOpenStats : null}
        />
      ) : null}
      <span className="gl-user-name">{auth?.displayName || auth?.roleSlug || 'Session'}</span>
      {canSwitchGlPlayerView ? (
        <>
          {glViewMode !== 'native' && typeof onGlViewModeNative === 'function' ? (
            <button
              type="button"
              className="gl-logout"
              aria-label="Revenir au rôle normal"
              title="Revenir au rôle normal"
              onClick={onGlViewModeNative}
            >
              ↩️
            </button>
          ) : null}
          {glViewMode !== 'player' && typeof onGlViewModePlayer === 'function' ? (
            <button
              type="button"
              className="gl-logout"
              aria-label="Passer en vue joueur"
              title="Passer en vue joueur (aperçu)"
              onClick={onGlViewModePlayer}
            >
              🎮
            </button>
          ) : null}
        </>
      ) : null}
      <button type="button" className="gl-logout" onClick={onOpenProfile}>
        Mon profil
      </button>
      <button type="button" className="gl-logout" onClick={onLogout}>
        Déconnexion
      </button>
    </div>
  );

  return (
    <>
      <div
        className={`gl-topbar${isScrolled ? ' is-scrolled' : ''}${compactNav ? ' gl-topbar--compact' : ''}`}
        role="banner"
      >
        <div className="gl-brand">
          <div className="gl-brand-header">
            {brandLogoUrl ? (
              <img src={brandLogoUrl} alt="Logo G&L" className="gl-brand-logo" />
            ) : null}
            <div>
              <div className="gl-brand-title">{title}</div>
              {!compactNav ? <div className="gl-brand-subtitle">{subtitle}</div> : null}
            </div>
          </div>
        </div>

        {!compactNav ? (
          <nav className="gl-tabs" role="tablist" aria-label="Navigation Gnomes et Licornes">
            {tabs.map((tab) => (
              <GLNavTabButton
                key={tab.id}
                tab={tab}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                tabIdPrefix={GL_TAB_ID_PREFIX}
                panelIdPrefix={GL_TABPANEL_ID_PREFIX}
              />
            ))}
          </nav>
        ) : null}

        {userChrome}
      </div>

      {compactNav ? (
        <>
          <GLBottomNav
            primaryTabs={primaryTabs}
            overflowCount={overflowCount}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onOpenDrawer={() => setDrawerOpen(true)}
            tabIdPrefix={GL_TAB_ID_PREFIX}
            panelIdPrefix={GL_TABPANEL_ID_PREFIX}
          />
          {drawerOpen ? (
            <GLMobileNavDrawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              tabIdPrefix={GL_TAB_ID_PREFIX}
              panelIdPrefix={GL_TABPANEL_ID_PREFIX}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
