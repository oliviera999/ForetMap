import { useEffect, useMemo, useState } from 'react';
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
  /** Ensemble unifié (M1) : une seule monnaie — la barre ne montre que les gemmes. */
  gemmesSeules = false,
  playerPlume = false,
  showVersion = false,
  appVersion = null,
  canSwitchGlPlayerView = false,
  glViewMode = 'native',
  onGlViewModeNative = null,
  onGlViewModePlayer = null,
  isGuestMode = false,
  /** Borne de démonstration (`?kiosque=1`) : aucune sortie possible depuis l'écran. */
  kioskMode = false,
  /**
   * Mode séance (console du prof, écran « Jouer le tour ») : `{ partie, tour }`. La barre se
   * réduit à une ligne ; « Menu » redéplie les onglets et le compte.
   */
  seance = null,
}) {
  const isScrolled = useStickyHeaderScrolled();
  const compactNav = useGlCompactNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const enSeance = !!seance;
  const [menuDeplie, setMenuDeplie] = useState(false);
  // Le menu déplié ne survit pas à l'écran du tour : la séance suivante repart d'une ligne.
  useEffect(() => {
    if (!enSeance) setMenuDeplie(false);
  }, [enSeance]);
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

  const userChrome = isGuestMode ? (
    <div className="gl-user">
      <span className="gl-user-name">{auth?.displayName || 'Visiteur'}</span>
      {kioskMode ? null : (
        <button type="button" className="gl-logout" onClick={onLogout}>
          Quitter la découverte
        </button>
      )}
    </div>
  ) : (
    <div className="gl-user">
      {showVersion ? <GLAppVersionBadge appVersion={appVersion} /> : null}
      {playerMascotId ? (
        <span className="gl-topbar-mascot" aria-hidden="true">
          <GLMascotRenderer mascotId={playerMascotId} size={32} />
        </span>
      ) : null}
      {vitalityEnabled &&
      playerPowerPoints != null &&
      (gemmesSeules || playerHealthPoints != null) ? (
        <GLVitalityBadge
          health={playerHealthPoints}
          power={playerPowerPoints}
          gemmesSeules={gemmesSeules}
          plume={playerPlume}
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

  if (enSeance && !menuDeplie) {
    // Une ligne : rien ne doit prendre la place du tour. La navigation du bas (écran étroit)
    // disparaît avec les onglets ; « Menu » rend tout.
    return (
      <div
        className={`gl-topbar gl-topbar--seance${isScrolled ? ' is-scrolled' : ''}`}
        role="banner"
        data-testid="gl-topbar-seance"
      >
        <div className="gl-topbar-seance__titre">
          <strong className="gl-topbar-seance__partie">{seance.partie || title}</strong>
          {seance.tour ? <span className="gl-topbar-seance__tour">{seance.tour}</span> : null}
        </div>
        <button
          type="button"
          className="gl-logout"
          aria-expanded="false"
          data-testid="gl-topbar-menu"
          onClick={() => setMenuDeplie(true)}
        >
          Menu
        </button>
      </div>
    );
  }

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
        {enSeance ? (
          <button
            type="button"
            className="gl-logout gl-topbar-seance__replier"
            aria-expanded="true"
            data-testid="gl-topbar-menu"
            onClick={() => setMenuDeplie(false)}
          >
            Réduire le menu
          </button>
        ) : null}
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
