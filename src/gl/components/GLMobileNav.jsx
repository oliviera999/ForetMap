import React, { useEffect, useId } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

function GlNavTabButton({
  tab,
  activeTab,
  onTabChange,
  tabIdPrefix,
  panelIdPrefix,
  className = 'gl-tab',
  showLabel = true,
}) {
  const tabDomId = `${tabIdPrefix}-${tab.id}`;
  const panelId = `${panelIdPrefix}-${tab.id}`;
  const isActive = activeTab === tab.id;
  return (
    <button
      id={tabDomId}
      type="button"
      role="tab"
      className={`${className}${isActive ? ' is-active' : ''}`}
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      aria-label={showLabel ? undefined : tab.label}
      onClick={() => onTabChange(tab.id)}
    >
      <span className="gl-tab-icon foretmap-emoji-text-mixed" aria-hidden>
        {tab.icon || '📌'}
      </span>
      {showLabel ? <span className="gl-tab-label">{tab.label}</span> : null}
    </button>
  );
}

export function GLMobileNavDrawer({
  open,
  onClose,
  tabs,
  activeTab,
  onTabChange,
  tabIdPrefix,
  panelIdPrefix,
}) {
  const titleId = useId();
  const panelRef = useDialogA11y(onClose);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  function handleSelect(tabId) {
    onTabChange(tabId);
    onClose();
  }

  return (
    <div className="gl-nav-drawer-overlay" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="gl-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gl-nav-drawer-head">
          <h2 id={titleId} className="gl-nav-drawer-title">
            Navigation
          </h2>
          <button
            type="button"
            className="gl-nav-drawer-close"
            aria-label="Fermer le menu"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="gl-nav-drawer-tabs" role="tablist" aria-label="Tous les onglets">
          {tabs.map((tab) => (
            <GlNavTabButton
              key={tab.id}
              tab={tab}
              activeTab={activeTab}
              onTabChange={handleSelect}
              tabIdPrefix={tabIdPrefix}
              panelIdPrefix={panelIdPrefix}
              className="gl-nav-drawer-tab"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GLNavTabButton(props) {
  return <GlNavTabButton {...props} />;
}

export function GLBottomNav({
  primaryTabs,
  overflowCount,
  activeTab,
  onTabChange,
  onOpenDrawer,
  tabIdPrefix,
  panelIdPrefix,
}) {
  const showMoreActive = primaryTabs.every((tab) => tab.id !== activeTab);
  return (
    <nav className="gl-bottom-nav" role="tablist" aria-label="Navigation principale">
      {primaryTabs.map((tab) => (
        <GlNavTabButton
          key={tab.id}
          tab={tab}
          activeTab={activeTab}
          onTabChange={onTabChange}
          tabIdPrefix={tabIdPrefix}
          panelIdPrefix={panelIdPrefix}
          className="gl-bottom-nav-item"
          showLabel
        />
      ))}
      <button
        type="button"
        className={`gl-bottom-nav-item gl-bottom-nav-more${showMoreActive ? ' is-active' : ''}`}
        aria-label={`Plus d'onglets${overflowCount > 0 ? ` (${overflowCount} disponibles)` : ''}`}
        aria-haspopup="dialog"
        onClick={onOpenDrawer}
      >
        <span className="gl-tab-icon foretmap-emoji-text-mixed" aria-hidden>
          ⋯
        </span>
        <span className="gl-tab-label">Plus</span>
      </button>
    </nav>
  );
}
