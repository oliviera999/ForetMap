import { useState } from 'react';
import { normalizeUserGroups } from '../../utils/profilesUserGroups.js';

/**
 * Rattachements de groupes d'un compte, modifiables depuis la fiche (P14 de l'audit UX).
 *
 * Les groupes y étaient visibles mais figés : corriger un rattachement imposait de fermer la
 * fiche, ouvrir le sous-onglet Groupes, retrouver le groupe puis la personne. C'est la seule
 * proposition de l'audit qui déplace une capacité d'écriture — elle reste donc conditionnée à
 * `canManage` (permission `groups.manage`) et réservée aux comptes élèves, comme les routes
 * `POST/DELETE /api/groups/:id/members/:userId` qu'elle appelle.
 *
 * Présentationnel : `onAttach(groupId)` / `onDetach(groupId)` renvoient une promesse ; les
 * erreurs sont affichées ici, au plus près de l'action.
 */
export function UserGroupsEditor({
  groups,
  groupOptions = [],
  canManage = false,
  disabled = false,
  onAttach,
  onDetach,
}) {
  const [pendingGroupId, setPendingGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = normalizeUserGroups(groups);
  const currentIds = new Set(current.map((g) => g.id));
  const available = groupOptions.filter((g) => !currentIds.has(String(g.id)));

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setPendingGroupId('');
    } catch (e) {
      setError(e?.message || 'Opération impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profiles-groups-editor">
      {current.length === 0 ? (
        <p className="profiles-groups-editor__empty">Aucun groupe</p>
      ) : (
        <ul className="profiles-groups-editor__list">
          {current.map((g) => (
            <li key={g.id}>
              <span
                className={`profiles-user-chip profiles-user-chip--group${g.isActive ? '' : ' profiles-user-chip--inactive'}`}
              >
                {g.name}
                {g.kindLabel && <span className="profiles-user-chip__meta">{g.kindLabel}</span>}
                {g.forcesDefaultRole && (
                  <span className="profiles-user-chip__meta">profil imposé</span>
                )}
              </span>
              {canManage && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || disabled}
                  onClick={() => run(() => onDetach(g.id))}
                  aria-label={`Retirer du groupe ${g.name}`}
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="profiles-groups-editor__add">
          <label htmlFor="user-group-add">Rattacher à un groupe</label>
          <div className="profiles-groups-editor__add-row">
            <select
              id="user-group-add"
              value={pendingGroupId}
              onChange={(e) => setPendingGroupId(e.target.value)}
              disabled={busy || disabled || available.length === 0}
            >
              <option value="">
                {available.length === 0 ? 'Aucun autre groupe disponible' : 'Choisir…'}
              </option>
              {available.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || disabled || !pendingGroupId}
              onClick={() => run(() => onAttach(pendingGroupId))}
            >
              {busy ? 'En cours…' : 'Rattacher'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="profiles-groups-editor__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
