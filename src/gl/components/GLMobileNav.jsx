import { BottomSheet } from '../../shared/ui/BottomSheet.jsx';

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

/**
 * Tiroir « Plus » de la navigation mobile G&L : feuille basse partagée (`BottomSheet`),
 * onglets restants en grille dans le corps ; choisir un onglet referme le tiroir.
 */
export function GLMobileNavDrawer({
  open,
  onClose,
  tabs,
  activeTab,
  onTabChange,
  tabIdPrefix,
  panelIdPrefix,
}) {
  function handleSelect(tabId) {
    onTabChange(tabId);
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Navigation"
      closeLabel="Fermer le menu"
      className="gl-nav-drawer"
      overlayClassName="gl-nav-drawer-overlay"
      initialSnap="half"
    >
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
    </BottomSheet>
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
