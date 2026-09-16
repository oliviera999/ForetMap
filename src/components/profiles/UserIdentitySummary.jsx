import { UserGroupsChips } from './UserGroupsChips.jsx';
import { userRoleLabel, userTypeLabel } from '../../utils/profilesUserGroups.js';

/**
 * Carte d'identité en lecture seule d'un compte, en tête de la fiche utilisateur admin
 * (modale « Modifier le compte »). Répond au besoin : voir **le profil** (rôle principal)
 * et **le ou les groupes** sans quitter la fiche ni ouvrir l'onglet Groupes.
 *
 * Présentationnel pur : `user` est la fiche fusionnée (`mergeRbacUserRowsForEdit`).
 */
export function UserIdentitySummary({ user }) {
  if (!user) return null;
  const roleLabel = userRoleLabel(user);
  const typeLabel = userTypeLabel(user.user_type);
  const identifier = String(user.email || '').trim() || String(user.pseudo || '').trim();

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
          <dt>{Array.isArray(user.groups) && user.groups.length > 1 ? 'Groupes' : 'Groupe'}</dt>
          <dd>
            <UserGroupsChips groups={user.groups} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
