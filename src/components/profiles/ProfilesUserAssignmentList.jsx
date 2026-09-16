import { UserGroupsChips } from './UserGroupsChips.jsx';
import { userTypeLabel } from '../../utils/profilesUserGroups.js';

const MAX_ROW_GROUP_CHIPS = 3;

/**
 * Liste d'attribution des profils aux comptes — extraite de `ProfilesAdminView` (O5/O6).
 *
 * Pour chaque utilisateur : identité (nom, type, groupes de rattachement), un sélecteur de
 * profil principal (`onAssignRole(userType, id, roleId)`) et un bouton « Modifier »
 * (`onOpenEditUser(user)`). Seul un admin peut modifier un autre admin (`isAdmin`).
 * Présentation pure.
 */
export function ProfilesUserAssignmentList({
  users = [],
  roles = [],
  loading = false,
  editUserLoadState = 'idle',
  isAdmin = false,
  onAssignRole,
  onOpenEditUser,
}) {
  const canEditUserRow = (u) => isAdmin || String(u.role_slug || '').toLowerCase() !== 'admin';
  return (
    <div style={{ maxHeight: 360, overflow: 'auto' }}>
      {users.map((u) => (
        <div
          className="profiles-admin-user-row"
          key={`${u.user_type}-${u.id}`}
          style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
        >
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div className="profiles-admin-user-row__identity">
              <strong>{u.display_name}</strong>
              <span className="profiles-user-chip profiles-user-chip--type">
                {userTypeLabel(u.user_type)}
              </span>
            </div>
            <UserGroupsChips groups={u.groups} max={MAX_ROW_GROUP_CHIPS} />
          </div>
          <select
            value={u.role_id || ''}
            onChange={(e) => onAssignRole(u.user_type, u.id, parseInt(e.target.value, 10))}
            disabled={loading}
            aria-label={`Profil de ${u.display_name}`}
          >
            <option value="">Aucun profil</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onOpenEditUser(u)}
            disabled={loading || editUserLoadState === 'loading' || !canEditUserRow(u)}
            title={
              !canEditUserRow(u)
                ? 'Seul un administrateur peut modifier un autre administrateur'
                : 'Modifier ce compte'
            }
          >
            Modifier
          </button>
        </div>
      ))}
    </div>
  );
}
