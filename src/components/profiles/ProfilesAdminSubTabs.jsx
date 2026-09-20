/**
 * Sous-onglets de l'admin « Profils & utilisateurs » (barre secondaire `.fm-subtabs`).
 *
 * Ils empruntaient `.top-tabs` / `.top-tab`, c'est-à-dire la barre de navigation
 * PRINCIPALE du professeur : deux niveaux de navigation avaient la même forme, empilés
 * l'un sous l'autre. `.fm-subtabs` en est la déclinaison secondaire — mêmes couleurs,
 * une hauteur en dessous.
 *
 * P15 de l'audit UX : les deux compteurs avaient la même forme et deux sens opposés —
 * « Comptes (128) » informait du nombre de résultats filtrés, « Groupes (3) » alertait sur
 * des visiteurs à rattacher. Le premier devient « 128 / 350 » (résultats sur total), le second
 * une pastille d'alerte distincte, annoncée comme telle aux lecteurs d'écran.
 *
 * Chaque onglet a sa propre porte : `canShowProfiles` (définition des rôles,
 * `admin.roles.manage`), `canShowAccounts` (lister les comptes ou gérer les élèves),
 * `canShowGroups` (gérer ou lire les groupes — l'onglet « Classe » du prof de classe),
 * `canShowImports`. `canManageProfiles` / `canManageStudents` restent acceptés en repli.
 */
export function ProfilesAdminSubTabs({
  active,
  onChange,
  canManageProfiles = false,
  canManageStudents = false,
  canShowProfiles = canManageProfiles,
  canShowAccounts = canManageProfiles || canManageStudents,
  canShowGroups = canManageProfiles,
  canShowImports = false,
  pendingVisitorsCount = 0,
  accountsFilteredCount = null,
  accountsTotalCount = null,
}) {
  const tabs = [];
  if (canShowProfiles) {
    tabs.push({ id: 'profils', label: 'Profils' });
  }
  if (canShowAccounts) {
    let count = null;
    if (accountsFilteredCount != null) {
      count =
        accountsTotalCount != null && accountsTotalCount !== accountsFilteredCount
          ? `${accountsFilteredCount} / ${accountsTotalCount}`
          : String(accountsFilteredCount);
    }
    tabs.push({ id: 'comptes', label: 'Comptes', count });
  }
  if (canShowGroups) {
    tabs.push({
      id: 'groupes',
      label: 'Groupes',
      alert: pendingVisitorsCount > 0 ? pendingVisitorsCount : null,
      alertLabel:
        pendingVisitorsCount > 0
          ? `${pendingVisitorsCount} compte${pendingVisitorsCount > 1 ? 's' : ''} à rattacher`
          : null,
    });
  }
  if (canShowImports) {
    tabs.push({ id: 'imports', label: 'Imports & exports' });
  }
  if (tabs.length === 0) return null;

  return (
    <div className="fm-subtabs profiles-admin-subtabs" role="tablist" aria-label="Sections profils">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={active === t.id ? 'is-active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="profiles-subtab-count"> {t.count}</span>}
          {t.alert != null && (
            <span className="profiles-subtab-alert" aria-label={t.alertLabel}>
              {t.alert}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
