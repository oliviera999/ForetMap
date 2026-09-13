/**
 * Sous-onglets de l'admin « Profils & utilisateurs » (pattern Audit `top-tabs`).
 */
export function ProfilesAdminSubTabs({
  active,
  onChange,
  canManageProfiles = false,
  canManageStudents = false,
  canShowImports = false,
  pendingVisitorsCount = 0,
  accountsFilteredCount = null,
}) {
  const tabs = [];
  if (canManageProfiles) {
    tabs.push({ id: 'profils', label: 'Profils' });
  }
  if (canManageProfiles || canManageStudents) {
    tabs.push({
      id: 'comptes',
      label: accountsFilteredCount != null ? `Comptes (${accountsFilteredCount})` : 'Comptes',
    });
  }
  if (canManageProfiles) {
    tabs.push({
      id: 'groupes',
      label: pendingVisitorsCount > 0 ? `Groupes (${pendingVisitorsCount})` : 'Groupes',
    });
  }
  if (canShowImports) {
    tabs.push({ id: 'imports', label: 'Imports & exports' });
  }
  if (tabs.length === 0) return null;

  return (
    <div className="top-tabs profiles-admin-subtabs" role="tablist" aria-label="Sections profils">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`top-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
