import { normalizeUserGroups, summarizeUserGroups } from '../../utils/profilesUserGroups.js';

/**
 * Pastilles « groupes » d'un compte (administration Profils & utilisateurs).
 * Présentationnel pur : `groups` est la liste brute renvoyée par `/api/rbac/users*`.
 *
 * `max` limite le nombre de pastilles affichées (le reste devient « +N ») — utilisé dans la
 * liste des comptes, où chaque ligne doit rester lisible ; la fiche utilisateur n'en pose pas.
 */
export function UserGroupsChips({ groups, max = 0, emptyLabel = 'Aucun groupe', size = 'sm' }) {
  const list = normalizeUserGroups(groups);
  if (list.length === 0) {
    return (
      <span
        className="profiles-user-chip profiles-user-chip--empty"
        data-testid="user-groups-empty"
      >
        {emptyLabel}
      </span>
    );
  }
  const limit = max > 0 ? max : list.length;
  const shown = list.slice(0, limit);
  const hidden = list.length - shown.length;
  return (
    <span
      className={`profiles-user-chips profiles-user-chips--${size}`}
      data-testid="user-groups-chips"
      title={summarizeUserGroups(list)}
    >
      {shown.map((g) => (
        <span
          key={g.id}
          className={`profiles-user-chip profiles-user-chip--group${g.isActive ? '' : ' profiles-user-chip--inactive'}`}
        >
          {g.name}
          {g.kindLabel && <span className="profiles-user-chip__meta">{g.kindLabel}</span>}
          {!g.isActive && <span className="profiles-user-chip__meta">archivé</span>}
        </span>
      ))}
      {hidden > 0 && <span className="profiles-user-chip profiles-user-chip--more">+{hidden}</span>}
    </span>
  );
}
