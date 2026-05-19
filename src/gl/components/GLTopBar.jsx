import React from 'react';

export function GLTopBar({
  tabs,
  activeTab,
  onTabChange,
  auth,
  onLogout,
}) {
  return (
    <header className="gl-topbar">
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
        <span>{auth?.displayName || auth?.roleSlug || 'Session'}</span>
        <button type="button" className="gl-logout" onClick={onLogout}>
          Deconnexion
        </button>
      </div>
    </header>
  );
}
