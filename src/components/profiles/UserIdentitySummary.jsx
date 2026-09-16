import { UserGroupsChips } from './UserGroupsChips.jsx';
import { UserGroupsEditor } from './UserGroupsEditor.jsx';
import {
  accountMetaEntries,
  userRoleLabel,
  userTypeLabel,
} from '../../utils/profilesUserGroups.js';

/**
 * Section « Droits & groupes » de la fiche utilisateur admin.
 *
 * Répond au besoin initial — voir **le profil** (rôle principal) et **le ou les groupes** sans
 * quitter la fiche — et porte deux constats de l'audit UX : les métadonnées de support (P13 :
 * compte actif ? créé quand ? venu d'où ?), qui sont exactement les questions posées quand
 * « il ne peut pas se connecter », et le rattachement modifiable sur place (P14) quand l'acteur
 * en a le droit.
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
  const typeLabel = userTypeLabel(user.user_type);
  const identifier = String(user.email || '').trim() || String(user.pseudo || '').trim();
  const meta = accountMetaEntries(user);
  const isStudent = String(user.user_type || '').toLowerCase() === 'student';
  const editableGroups = canManageGroups && isStudent;
  const groupCount = Array.isArray(user.groups) ? user.groups.length : 0;

  return (
    <section className="profiles-user-summary" data-testid="user-identity-summary">
      <div className="profiles-user-summary__head">
        <strong className="profiles-user-summary__name">{user.display_name}</strong>
        <span className="profiles-user-chip profiles-user-chip--type">{typeLabel}</span>
        {identifier && <span className="profiles-user-summary__id">{identifier}</span>}
      </div>

      <dl className="profiles-user-summary__grid">
        <div className="profiles-user-summary__row">
          <dt>Profil</dt>
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
          </dd>
        </div>
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
