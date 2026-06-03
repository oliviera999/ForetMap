import React from 'react';
import { GLAppVersionBadge } from './GLAppVersionBadge.jsx';
import { GLMascotAvatar } from './GLMascotAvatar.jsx';
import { GLVitalityBadge } from './GLVitalityDisplay.jsx';

function isGlMascotId(id) {
  return typeof id === 'string' && id.startsWith('gl-');
}

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
  const title = String(platformTitle || 'Gnomes & Licornes');
  const subtitle = String(platformSubtitle || 'Le jeu de Sciences et Technologie');
  return (
    <div className="gl-topbar" role="banner">
      <div className="gl-brand">
        <div className="gl-brand-header">
          {brandLogoUrl ? <img src={brandLogoUrl} alt="Logo G&L" className="gl-brand-logo" /> : null}
          <div>
            <div className="gl-brand-title">{title}</div>
            <div className="gl-brand-subtitle">{subtitle}</div>
          </div>
        </div>
      </div>
      <nav className="gl-tabs" aria-label="Navigation Gnomes et Licornes">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`gl-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="gl-tab-icon foretmap-emoji-text-mixed" aria-hidden>{tab.icon || '📌'}</span>
            <span className="gl-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
      <div className="gl-user">
        {showVersion ? <GLAppVersionBadge appVersion={appVersion} /> : null}
        {isGlMascotId(playerMascotId) ? (
          <GLMascotAvatar mascotId={playerMascotId} size={32} />
        ) : null}
        {vitalityEnabled && playerHealthPoints != null && playerPowerPoints != null ? (
          <GLVitalityBadge
            health={playerHealthPoints}
            power={playerPowerPoints}
            onClick={typeof onOpenStats === 'function' ? onOpenStats : null}
          />
        ) : null}
        <span>{auth?.displayName || auth?.roleSlug || 'Session'}</span>
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
          Deconnexion
        </button>
      </div>
    </div>
  );
}
