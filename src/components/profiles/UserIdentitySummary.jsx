import { UserGroupsChips } from './UserGroupsChips.jsx';
import { UserGroupsEditor } from './UserGroupsEditor.jsx';
import {
  accountMetaEntries,
  effectiveRoleOriginLabel,
  userAssignedRoleLabel,
  userRoleLabel,
  userTypeLabel,
} from '../../utils/profilesUserGroups.js';

/**
 * Section « Droits & groupes » de la fiche utilisateur admin.
 *
 * Répond au besoin initial — voir **le profil** et **le ou les groupes** sans quitter la
 * fiche — et porte deux constats de l'audit UX : les métadonnées de support (P13 : compte
 * actif ? créé quand ? venu d'où ?), qui sont exactement les questions posées quand « il ne
 * peut pas se connecter », et le rattachement modifiable sur place (P14) quand l'acteur en a
 * le droit.
 *
 * Deux profils sont montrés, parce que la règle « le plus élevé l'emporte » les distingue :
 * le profil **attribué** (posé sur le compte) et le profil **effectif** (ce que le compte
 * peut faire), avec son origine — « attribué », « conféré par le groupe X » ou « imposé par
 * le groupe X ».
 *
 * Présentationnel : `user` est la fiche fusionnée (`mergeRbacUserRowsForEdit`).
 */
export function UserIdentitySummary({
  user,
  groupOptions = [],
  canManageGroups = false,
  disabled = false,
  onAttachGroup,
  onDetachGroup,
}) {
  if (!user) return null;
  const roleLabel = userRoleLabel(user);
  const assignedLabel = userAssignedRoleLabel(user);
  const originLabel = effectiveRoleOriginLabel(user);
  const conferring = Array.isArray(user.conferring_groups) ? user.conferring_groups : [];
  const typeLabel = userTypeLabel(user.user_type);
  const identifier = String(user.email || '').trim() || String(user.pseudo || '').trim();
  const meta = accountMetaEntries(user);
  const isStudent = String(user.user_type || '').toLowerCase() === 'student';
  const editableGroups = canManageGroups && isStudent;
  const groupCount = Array.isArray(user.groups) ? user.groups.length : 0;
  // Sans fiche détaillée (liste seule), les deux profils sont confondus : une seule ligne.
  const hasAssignedInfo =
    user.assigned_role_id != null || user.assigned_role_slug != null || Boolean(originLabel);

  return (
    <section className="profiles-user-summary" data-testid="user-identity-summary">
      <div className="profiles-user-summary__head">
        <strong className="profiles-user-summary__name">{user.display_name}</strong>
        <span className="profiles-user-chip profiles-user-chip--type">{typeLabel}</span>
        {user.is_active === false && (
          <span
            className="profiles-user-chip profiles-user-chip--inactive-account"
            data-testid="user-summary-inactive"
          >
            désactivé
          </span>
        )}
        {identifier && <span className="profiles-user-summary__id">{identifier}</span>}
      </div>

      <dl className="profiles-user-summary__grid">
        {hasAssignedInfo && (
          <div className="profiles-user-summary__row">
            <dt>Profil attribué</dt>
            <dd>
              {assignedLabel ? (
                <span
                  className="profiles-user-chip profiles-user-chip--role"
                  data-testid="user-summary-assigned-role"
                >
                  {assignedLabel}
                </span>
              ) : (
                <span
                  className="profiles-user-chip profiles-user-chip--empty"
                  data-testid="user-summary-assigned-role"
                >
                  Aucun profil attribué
                </span>
              )}
            </dd>
          </div>
        )}
        <div className="profiles-user-summary__row">
          <dt>{hasAssignedInfo ? 'Profil effectif' : 'Profil'}</dt>
          <dd>
            {roleLabel ? (
              <span
                className="profiles-user-chip profiles-user-chip--role"
                data-testid="user-summary-role"
              >
                {roleLabel}
              </span>
            ) : (
              <span
                className="profiles-user-chip profiles-user-chip--empty"
                data-testid="user-summary-role"
              >
                Aucun profil
              </span>
            )}
            {originLabel && (
              <span
                className="profiles-user-summary__origin"
                data-testid="user-summary-role-origin"
              >
                {' '}
                ({originLabel})
              </span>
            )}
          </dd>
        </div>
        {conferring.length > 0 && (
          <div className="profiles-user-summary__row">
            <dt>Profils de groupe</dt>
            <dd>
              <ul
                className="profiles-user-summary__conferring"
                data-testid="user-summary-conferring"
              >
                {conferring.map((entry) => (
                  <li key={entry.groupId}>
                    {entry.groupName || entry.groupId} :{' '}
                    {entry.role?.displayName || entry.role?.slug || '—'}
                    {entry.forced ? ' (imposé)' : ''}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div className="profiles-user-summary__row">
          <dt>{groupCount > 1 ? 'Groupes' : 'Groupe'}</dt>
          <dd>
            {editableGroups ? (
              <UserGroupsEditor
                groups={user.groups}
                groupOptions={groupOptions}
                canManage
                disabled={disabled}
                onAttach={onAttachGroup}
                onDetach={onDetachGroup}
              />
            ) : (
              <UserGroupsChips groups={user.groups} />
            )}
          </dd>
        </div>
      </dl>

      {meta.length > 0 && (
        <dl className="profiles-user-summary__meta" data-testid="user-summary-meta">
          {meta.map((entry) => (
            <div key={entry.label} className="profiles-user-summary__meta-item">
              <dt>{entry.label}</dt>
              <dd
                className={entry.tone === 'warn' ? 'profiles-user-summary__meta--warn' : undefined}
              >
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
