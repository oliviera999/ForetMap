import { UserGroupsChips } from './UserGroupsChips.jsx';
import { userTypeLabel } from '../../utils/profilesUserGroups.js';
import { profilesUserKey } from '../../utils/profilesUserListFilters.js';
import { IconDelete, IconDuplicate } from '../../shared/icons.jsx';

const MAX_ROW_GROUP_CHIPS = 3;

/**
 * Liste unique des comptes de l'onglet Comptes.
 *
 * Elle porte désormais **toutes** les actions sur un compte (P1 de l'audit UX) : profil,
 * Modifier, Dupliquer, Supprimer. Auparavant, supprimer ou dupliquer supposait une **seconde**
 * liste plus bas dans la page, avec sa propre recherche, sans filtres ni pagination — un
 * administrateur qui avait filtré sur une classe devait tout refaire sans garantie de parler du
 * même sous-ensemble.
 *
 * Trois autres constats sont traités ici : sélection multiple pour les actions groupées (P2),
 * retour d'information **sur la ligne** modifiée plutôt qu'en tête de page (P4), et désactivation
 * limitée à la ligne en cours de chargement au lieu de toute la page (P9).
 *
 * Présentation pure : sélection, statuts et appels API restent au parent.
 */
export function ProfilesUserAssignmentList({
  users = [],
  roles = [],
  loading = false,
  busyKeys = null,
  rowStatus = null,
  selectedKeys = null,
  isAdmin = false,
  canDelete = false,
  canDuplicate = false,
  onToggleSelect,
  onAssignRole,
  onOpenEditUser,
  onDeleteUser,
  onDuplicateUser,
}) {
  const canEditUserRow = (u) => isAdmin || String(u.role_slug || '').toLowerCase() !== 'admin';
  const isBusy = (key) => Boolean(busyKeys && busyKeys.has(key));
  const selectable = typeof onToggleSelect === 'function';

  return (
    <div className="profiles-admin-user-list">
      {users.map((u) => {
        const key = profilesUserKey(u);
        const busy = isBusy(key);
        const status = rowStatus ? rowStatus.get(key) : null;
        const editable = canEditUserRow(u);
        const isStudent = String(u.user_type || '').toLowerCase() === 'student';
        return (
          <div className="profiles-admin-user-row" key={key}>
            {selectable && (
              <input
                type="checkbox"
                className="profiles-admin-user-row__check"
                checked={Boolean(selectedKeys && selectedKeys.has(key))}
                onChange={() => onToggleSelect(u)}
                disabled={busy}
                aria-label={`Sélectionner ${u.display_name}`}
              />
            )}
            <div className="profiles-admin-user-row__main">
              <div className="profiles-admin-user-row__identity">
                <strong>{u.display_name}</strong>
                <span className="profiles-user-chip profiles-user-chip--type">
                  {userTypeLabel(u.user_type)}
                </span>
              </div>
              <UserGroupsChips groups={u.groups} max={MAX_ROW_GROUP_CHIPS} />
              {u.stats && (
                <p className="profiles-admin-user-row__stats">
                  {u.stats.done || 0} validée(s) · {u.stats.pending || 0} en cours
                </p>
              )}
              {status && (
                <p
                  className={`profiles-admin-user-row__status profiles-admin-user-row__status--${status.state}`}
                  role={status.state === 'error' ? 'alert' : 'status'}
                >
                  {status.message}
                </p>
              )}
            </div>
            <select
              value={u.role_id || ''}
              onChange={(e) => onAssignRole(u, e.target.value)}
              disabled={loading || busy || !editable}
              aria-label={`Profil de ${u.display_name}`}
            >
              <option value="">Aucun profil</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
            <div className="profiles-admin-user-row__actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenEditUser(u)}
                disabled={busy || !editable}
                title={
                  editable
                    ? 'Modifier ce compte'
                    : 'Seul un administrateur peut modifier un autre administrateur'
                }
                aria-label={`Modifier ${u.display_name}`}
              >
                Modifier
              </button>
              {canDuplicate && isStudent && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onDuplicateUser(u)}
                  disabled={busy}
                  aria-label={`Dupliquer ${u.display_name}`}
                >
                  <IconDuplicate size={14} /> Dupliquer
                </button>
              )}
              {canDelete && isStudent && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => onDeleteUser(u)}
                  disabled={busy || !editable}
                  aria-label={`Supprimer ${u.display_name}`}
                >
                  <IconDelete size={14} /> Supprimer
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
