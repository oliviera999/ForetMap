import { useState } from 'react';

/**
 * Barre d'actions groupées de l'onglet Comptes (P2 de l'audit UX).
 *
 * Attribuer un profil à 30 élèves demandait 30 interactions, chacune suivie d'un rechargement
 * complet de la liste — alors que le sous-onglet Groupes sait déjà rattacher en lot.
 *
 * Présentationnel : la sélection et les appels API restent au parent. `onAssignRole` et
 * `onAddToGroup` reçoivent l'identifiant choisi ; le parent confirme et applique.
 */
export function AccountsBulkBar({
  selectedCount = 0,
  totalCount = 0,
  roles = [],
  groupOptions = [],
  busy = false,
  canAssignRoles = false,
  canManageGroups = false,
  onAssignRole,
  onAddToGroup,
  onSelectAll,
  onClear,
}) {
  const [roleId, setRoleId] = useState('');
  const [groupId, setGroupId] = useState('');
  if (selectedCount === 0) return null;

  return (
    <div className="profiles-bulk-bar" data-testid="accounts-bulk-bar">
      <p className="profiles-bulk-bar__count">
        <strong>{selectedCount}</strong> sélectionné{selectedCount > 1 ? 's' : ''}
        {totalCount > selectedCount && (
          <>
            {' · '}
            <button type="button" className="btn-link" onClick={onSelectAll} disabled={busy}>
              tout sélectionner ({totalCount})
            </button>
          </>
        )}
      </p>
      <div className="profiles-bulk-bar__actions">
        {canAssignRoles && (
          <div className="profiles-bulk-bar__action">
            <label htmlFor="bulk-role">Attribuer le profil</label>
            <div className="profiles-bulk-bar__action-row">
              <select
                id="bulk-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={busy}
              >
                <option value="">Choisir…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.display_name || r.slug}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || !roleId}
                onClick={() => onAssignRole(roleId)}
              >
                Appliquer
              </button>
            </div>
          </div>
        )}
        {canManageGroups && groupOptions.length > 0 && (
          <div className="profiles-bulk-bar__action">
            <label htmlFor="bulk-group">Rattacher au groupe</label>
            <div className="profiles-bulk-bar__action-row">
              <select
                id="bulk-group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={busy}
              >
                <option value="">Choisir…</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy || !groupId}
                onClick={() => onAddToGroup(groupId)}
              >
                Rattacher
              </button>
            </div>
            <p className="profiles-bulk-bar__hint">
              Seuls les comptes élèves sélectionnés sont rattachés.
            </p>
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={busy}>
          Tout désélectionner
        </button>
      </div>
    </div>
  );
}
