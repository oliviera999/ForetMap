import React from 'react';
import { GLMascotAvatar } from './GLMascotAvatar.jsx';

function isGlMascotId(id) {
  return typeof id === 'string' && id.startsWith('gl-');
}

export function GLTopBar({
  tabs,
  activeTab,
  onTabChange,
  auth,
  onLogout,
  playerMascotId,
}) {
  return (
    <div className="gl-topbar" role="banner">
      <div className="gl-brand">
        <div className="gl-brand-title">Gnomes &amp; Licornes</div>
        <div className="gl-brand-subtitle">Le jeu de Sciences et Technologie</div>
      </div>
      <nav className="gl-tabs" aria-label="Navigation Gnomes et Licornes">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`gl-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="gl-user">
        {isGlMascotId(playerMascotId) ? (
          <GLMascotAvatar mascotId={playerMascotId} size={32} />
        ) : null}
        <span>{auth?.displayName || auth?.roleSlug || 'Session'}</span>
        <button type="button" className="gl-logout" onClick={onLogout}>
          Deconnexion
        </button>
      </div>
    </div>
  );
}
